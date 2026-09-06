import type { Redis } from "ioredis";
import redis from "@/lib/redis.js";
import { CACHE_TTL } from "./cache.keys.js";

export class CacheService {
    private client: Redis;

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
     * Retrieves a cached item and parses JSON.
     * If Redis is down, disconnected, or throws an error, returns null to trigger DB query fallback.
     */
    async get<T>(key: string): Promise<T | null> {
        if (!this.isReady()) {
            return null;
        }

        try {
            const data = await this.client.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (error) {
            // Fault-tolerant fallback: Redis downtime never breaks API requests
            console.warn(`[CacheService] Failed to GET key "${key}":`, (error as Error).message);
            return null;
        }
    }

    /**
     * Serializes and sets a value in Redis with a TTL in seconds.
     * Fails silently if Redis is unavailable.
     */
    async set(key: string, value: unknown, ttlSeconds: number = CACHE_TTL.FIVE_MINUTES): Promise<void> {
        if (!this.isReady() || value === undefined || value === null) {
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
        if (!this.isReady()) {
            return;
        }

        try {
            const keyArray = Array.isArray(keys) ? keys : [keys];
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
