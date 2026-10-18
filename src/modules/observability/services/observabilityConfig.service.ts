// Manages observability thresholds and alert rules with L1 (In-Memory) and L2 (Redis) caching.
// Guarantees zero continuous database polling on telemetry and request evaluation paths.

import { prisma } from "@/lib/prisma.js";
import redis from "@/lib/redis.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";
import { logger } from "@/common/observability/logger.js";
import type {
    ObservabilityCategory,
    ObservabilityConfigItem,
    ObservabilityThresholdConfig,
} from "../types/observability.types.js";

// Standard default threshold definitions
export const DEFAULT_OBSERVABILITY_CONFIGS: Array<{
    key: string;
    category: ObservabilityCategory;
    description: string;
    value: ObservabilityThresholdConfig;
}> = [
    {
        key: "thresholds:server_5xx",
        category: "server_errors",
        description: "Primary service-health alert for 500-599 user-impacting server failures",
        value: {
            warningRatePercent: 2.0,
            criticalRatePercent: 5.0,
            evaluationWindowMinutes: 5,
            minimumRequestsPerMinute: 10,
            max5xxVolumePerMinute: 20,
        },
    },
    {
        key: "thresholds:client_4xx",
        category: "client_errors",
        description: "Client validation and route error tracking for 400, 404, 405, 413, 415, 422",
        value: {
            warningRatePercent: 10.0,
            criticalRatePercent: 25.0,
            evaluationWindowMinutes: 5,
            monitoredStatusCodes: [400, 404, 405, 413, 415, 422],
            excludeStatusCodes: [409, 410],
        },
    },
    {
        key: "thresholds:security_events",
        category: "security",
        description: "Security and policy metrics tracking for 401 Unauthorized, 403 Forbidden, 429 Rate Limiting",
        value: {
            spikeThresholdRequestsPerMin: 30,
            rateLimit429ThresholdPerMin: 15,
            evaluationWindowMinutes: 5,
            monitoredStatusCodes: [401, 403, 429],
        },
    },
    {
        key: "thresholds:business_operations",
        category: "business",
        description: "Business operation failure rates (payment failures, checkout errors, background DLQ)",
        value: {
            paymentFailureRatePercent: 2.0,
            orderFailureRatePercent: 1.0,
            backgroundJobDlqThreshold: 5,
            evaluationWindowMinutes: 5,
        },
    },
];

export class ObservabilityConfigService {
    // L1 in-memory storage for instant zero-latency reads
    private l1Cache = new Map<string, ObservabilityConfigItem>();
    private l1LoadedAt: number = 0;
    private readonly L1_TTL_MS = 60 * 1000; // 60 seconds fallback TTL

    constructor() {
        this.initializePubSubSubscriber();
    }

    // Listens for cross-instance invalidation messages to keep L1 cache synchronized
    private initializePubSubSubscriber() {
        try {
            if (process.env.NODE_ENV === "test") return;
            const sub = redis.duplicate();
            sub.on("error", (err) => {
                logger.warn({ error: err.message }, "[ObservabilityConfig] Redis pub/sub subscriber warning");
            });

            sub.subscribe(CACHE_KEYS.OBSERVABILITY.PUBSUB_CHANNEL, (err) => {
                if (err) {
                    logger.warn({ error: err.message }, "[ObservabilityConfig] Failed to subscribe to config changes");
                }
            });

            sub.on("message", (channel, message) => {
                if (channel === CACHE_KEYS.OBSERVABILITY.PUBSUB_CHANNEL) {
                    // Evict L1 cache when an admin updates configuration on any node
                    this.l1Cache.clear();
                    this.l1LoadedAt = 0;
                }
            });
        } catch (error) {
            logger.warn({ error: (error as Error).message }, "[ObservabilityConfig] Subscriber initialization skipped");
        }
    }

    // Fetches all configurations checking L1 memory -> L2 Redis -> DB
    async getAllConfigs(): Promise<ObservabilityConfigItem[]> {
        const now = Date.now();

        // 1. Check L1 Memory Cache (Fastest: 0ms, 0 Network, 0 DB)
        if (this.l1Cache.size > 0 && now - this.l1LoadedAt < this.L1_TTL_MS) {
            return Array.from(this.l1Cache.values());
        }

        // 2. Check L2 Redis Cache
        const cacheKey = CACHE_KEYS.OBSERVABILITY.ALL_CONFIGS();
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                const parsed: ObservabilityConfigItem[] = JSON.parse(cached);
                this.populateL1(parsed);
                return parsed;
            }
        } catch {
            // Redis error handled gracefully, fall through to DB
        }

        // 3. Fallback to Database (Only when caches are cold or empty)
        let dbRecords: any[] = [];
        try {
            dbRecords = await prisma.observabilityConfig.findMany({
                orderBy: { category: "asc" },
            });

            // Seed defaults if table is empty on initial setup
            if (dbRecords.length === 0) {
                await this.seedDefaultConfigs();
                dbRecords = await prisma.observabilityConfig.findMany({
                    orderBy: { category: "asc" },
                });
            }
        } catch (dbErr) {
            logger.warn({ error: (dbErr as Error).message }, "[ObservabilityConfig] DB read failed, falling back to in-memory defaults");
            const fallback = DEFAULT_OBSERVABILITY_CONFIGS.map((item, idx) => ({
                id: `default-${idx}`,
                key: item.key,
                category: item.category,
                value: item.value,
                description: item.description,
                isEnabled: true,
                updatedBy: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }));
            this.populateL1(fallback);
            return fallback;
        }

        const normalized = dbRecords.map((item) => ({
            id: item.id,
            key: item.key,
            category: item.category,
            value: (item.value ?? {}) as ObservabilityThresholdConfig,
            description: item.description,
            isEnabled: item.isEnabled,
            updatedBy: item.updatedBy,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
        }));

        // Backfill L2 Redis and L1 Memory
        try {
            await redis.set(cacheKey, JSON.stringify(normalized), "EX", CACHE_TTL.ONE_DAY);
        } catch {
            // Redis write failure is non-fatal
        }

        this.populateL1(normalized);
        return normalized;
    }

    // Retrieves a single configuration item by unique key
    async getConfig(key: string): Promise<ObservabilityConfigItem | null> {
        // Check L1 memory first
        const inMem = this.l1Cache.get(key);
        if (inMem && Date.now() - this.l1LoadedAt < this.L1_TTL_MS) {
            return inMem;
        }

        // Warm cache if missing
        const all = await this.getAllConfigs();
        return all.find((item) => item.key === key) || null;
    }

    // Updates a configuration record, persists to DB, and invalidates L1/L2 caches
    async updateConfig(
        key: string,
        updates: {
            value?: Record<string, unknown> | undefined;
            isEnabled?: boolean | undefined;
            description?: string | undefined;
        },
        adminUserId?: string | undefined,
    ): Promise<ObservabilityConfigItem> {
        const existing = await prisma.observabilityConfig.findUnique({
            where: { key },
        });

        // Merge existing config value with incoming updates
        const mergedValue = updates.value !== undefined
            ? { ...((existing?.value as Record<string, unknown>) ?? {}), ...updates.value }
            : (existing?.value as Record<string, unknown>) ?? {};

        const updated = await prisma.observabilityConfig.upsert({
            where: { key },
            create: {
                key,
                category: key.split(":")[1] || "custom",
                value: mergedValue as any,
                description: updates.description ?? existing?.description ?? null,
                isEnabled: updates.isEnabled ?? true,
                updatedBy: adminUserId ?? null,
            },
            update: {
                value: mergedValue as any,
                ...(updates.isEnabled !== undefined ? { isEnabled: updates.isEnabled } : {}),
                ...(updates.description !== undefined ? { description: updates.description } : {}),
                ...(adminUserId !== undefined ? { updatedBy: adminUserId } : {}),
            },
        });

        const normalized: ObservabilityConfigItem = {
            id: updated.id,
            key: updated.key,
            category: updated.category,
            value: (updated.value ?? {}) as ObservabilityThresholdConfig,
            description: updated.description,
            isEnabled: updated.isEnabled,
            updatedBy: updated.updatedBy,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
        };

        // Invalidate L2 and update local L1 immediately
        await this.invalidateAndPublish(normalized);

        return normalized;
    }

    // Resets all configurations to recommended baseline defaults
    async resetToDefaults(adminUserId?: string): Promise<ObservabilityConfigItem[]> {
        for (const config of DEFAULT_OBSERVABILITY_CONFIGS) {
            await prisma.observabilityConfig.upsert({
                where: { key: config.key },
                create: {
                    key: config.key,
                    category: config.category,
                    value: config.value as any,
                    description: config.description,
                    isEnabled: true,
                    updatedBy: adminUserId ?? null,
                },
                update: {
                    value: config.value as any,
                    description: config.description,
                    isEnabled: true,
                    updatedBy: adminUserId ?? null,
                },
            });
        }

        // Clear caches and reload
        this.l1Cache.clear();
        this.l1LoadedAt = 0;
        try {
            await redis.del(CACHE_KEYS.OBSERVABILITY.ALL_CONFIGS());
            await redis.publish(CACHE_KEYS.OBSERVABILITY.PUBSUB_CHANNEL, "reset");
        } catch {
            // Ignore Redis error
        }

        return this.getAllConfigs();
    }

    // Seeds initial default configs when database is cold
    private async seedDefaultConfigs() {
        for (const config of DEFAULT_OBSERVABILITY_CONFIGS) {
            await prisma.observabilityConfig.upsert({
                where: { key: config.key },
                create: {
                    key: config.key,
                    category: config.category,
                    value: config.value as any,
                    description: config.description,
                    isEnabled: true,
                },
                update: {},
            });
        }
    }

    // Populates L1 memory cache
    private populateL1(items: ObservabilityConfigItem[]) {
        this.l1Cache.clear();
        for (const item of items) {
            this.l1Cache.set(item.key, item);
        }
        this.l1LoadedAt = Date.now();
    }

    // Invalidates L2 Redis cache and broadcasts update to other nodes
    private async invalidateAndPublish(updatedItem: ObservabilityConfigItem) {
        // Update local L1 memory directly
        this.l1Cache.set(updatedItem.key, updatedItem);
        this.l1LoadedAt = Date.now();

        try {
            // Remove full list cache in Redis
            await redis.del(CACHE_KEYS.OBSERVABILITY.ALL_CONFIGS());

            // Notify cluster nodes to invalidate their L1 caches
            await redis.publish(CACHE_KEYS.OBSERVABILITY.PUBSUB_CHANNEL, updatedItem.key);
        } catch {
            // Ignore redis errors
        }
    }
}

export const observabilityConfigService = new ObservabilityConfigService();
