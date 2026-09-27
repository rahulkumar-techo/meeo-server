import type { Redis } from "ioredis";
import redis from "@/lib/redis.js";
import { CACHE_TTL } from "./cache.keys.js";

export class CacheService {
    private client: Redis;
    private memoryStore = new Map<string, { value: any; expiresAt: number }>();

    constructor(client: Redis = redis) {
        this.client = client;
    }

    /**
     * Checks if the Redis client is connected and ready.
     */
    private isReady(): boolean {
        return Boolean(this.client && (this.client.status === "ready" || this.client.status === "connect"));
    }

    /**
     * Retrieves a cached item. Checks L1 in-memory cache first (in non-test env), then L2 Redis.
     */
    async get<T>(key: string): Promise<T | null> {
        const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
        const now = Date.now();

        if (!isTest) {
            const mem = this.memoryStore.get(key);
            if (mem) {
                if (mem.expiresAt > now) {
                    return mem.value as T;
                }
                this.memoryStore.delete(key);
            }
        }

        if (!this.isReady()) {
            return null;
        }

        try {
            const data = await this.client.get(key);
            if (!data) return null;
            const parsed = JSON.parse(data) as T;
            // Backfill L1 memory cache for 60 seconds
            this.memoryStore.set(key, { value: parsed, expiresAt: now + 60000 });
            return parsed;
        } catch (error) {
            console.warn(`[CacheService] Failed to GET key "${key}":`, (error as Error).message);
            return null;
        }
    }

    /**
     * Serializes and sets a value in both L1 Memory and L2 Redis with a TTL in seconds.
     */
    async set(key: string, value: unknown, ttlSeconds: number = CACHE_TTL.FIVE_MINUTES): Promise<void> {
        if (value === undefined || value === null) {
            return;
        }

        const now = Date.now();
        this.memoryStore.set(key, { value, expiresAt: now + ttlSeconds * 1000 });

        if (!this.isReady()) {
            return;
        }

        try {
            const serialized = JSON.stringify(value);
            await this.client.set(key, serialized, "EX", ttlSeconds);
        } catch (error) {
            console.warn(`[CacheService] Failed to SET key "${key}":`, (error as Error).message);
        }
    }

    /**
     * Cache-aside helper: returns cached data or executes fetchFn directly against the database,
     * caching the result if Redis is healthy.
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        ttlSeconds: number = CACHE_TTL.FIVE_MINUTES,
    ): Promise<T> {
        try {
            const cached = await this.get<T>(key);
            if (cached !== null) {
                return cached;
            }
        } catch (err) {
            // If get fails, ignore and proceed to fetchFn directly
        }

        const freshData = await fetchFn();
        if (freshData !== null && freshData !== undefined) {
            // Asynchronously attempt to set cache; do not block response if set fails
            this.set(key, freshData, ttlSeconds).catch(() => {});
        }
        return freshData;
    }

    /**
     * Deletes one or multiple explicit cache keys.
     */
    async del(keys: string | string[]): Promise<void> {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArray) {
            this.memoryStore.delete(k);
        }

        if (!this.isReady()) {
            return;
        }

        try {
            const cleanKeys = keyArray.filter((k) => Boolean(k) && !k.includes("*"));
            if (cleanKeys.length > 0) {
                await this.client.del(...cleanKeys);
            }

            // If any wildcard patterns were included, invalidate via scan
            const patternKeys = keyArray.filter((k) => k.includes("*"));
            for (const pattern of patternKeys) {
                await this.invalidatePattern(pattern);
            }
        } catch (error) {
            console.warn("[CacheService] Failed to DEL keys:", (error as Error).message);
        }
    }

    /**
     * Non-blocking cache invalidation using Redis SCAN iteration (avoids KEYS command CPU locks).
     */
    async invalidatePattern(pattern: string): Promise<void> {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        for (const k of this.memoryStore.keys()) {
            if (regex.test(k)) {
                this.memoryStore.delete(k);
            }
        }

        if (!this.isReady()) {
            return;
        }

        try {
            let cursor = "0";
            const batchSize = 100;

            do {
                const [nextCursor, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", batchSize);
                cursor = nextCursor;

                if (keys.length > 0) {
                    await this.client.del(...keys);
                }
            } while (cursor !== "0");
        } catch (error) {
            console.warn(`[CacheService] Failed to invalidate pattern "${pattern}":`, (error as Error).message);
        }
    }

    /**
     * Flushes an entire domain namespace (e.g. "cache:product:*").
     */
    async flushNamespace(namespace: string): Promise<void> {
        const pattern = namespace.endsWith("*") ? namespace : `${namespace}:*`;
        await this.invalidatePattern(pattern);
    }
}

export const cacheService = new CacheService();
