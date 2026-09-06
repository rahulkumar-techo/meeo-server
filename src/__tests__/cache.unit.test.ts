import { describe, expect, it, vi, beforeEach } from "vitest";
import { CacheService } from "../common/cache/cache.service.js";
import type { Redis } from "ioredis";

describe("CacheService Unit Tests", () => {
    let mockRedis: any;
    let cacheService: CacheService;

    beforeEach(() => {
        const store = new Map<string, string>();

        mockRedis = {
            status: "ready",
            get: vi.fn(async (key: string) => store.get(key) ?? null),
            set: vi.fn(async (key: string, value: string, _mode?: any, _ttl?: any) => {
                store.set(key, value);
                return "OK" as const;
            }),
            del: vi.fn(async (...keys: string[]) => {
                let count = 0;
                for (const k of keys) {
                    if (store.delete(k)) count++;
                }
                return count;
            }),
            scan: vi.fn(async (_cursor: string, ..._args: any[]): Promise<[string, string[]]> => {
                // Return all keys in store matching pattern then cursor 0
                const keys = Array.from(store.keys());
                return ["0", keys];
            }),
        };

        cacheService = new CacheService(mockRedis as Redis);
    });

    it("sets and gets cached items successfully", async () => {
        const key = "test:key:1";
        const val = { id: "123", name: "Laptop" };

        await cacheService.set(key, val, 60);
        const result = await cacheService.get<typeof val>(key);

        expect(result).toEqual(val);
        expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it("returns null for non-existent cache keys", async () => {
        const result = await cacheService.get("test:nonexistent");
        expect(result).toBeNull();
    });

    it("executes fetcher on cache miss and caches result in getOrSet", async () => {
        const key = "product:123";
        const fetcher = vi.fn().mockResolvedValue({ id: "123", title: "Smart TV" });

        // 1. Cache miss
        const res1 = await cacheService.getOrSet(key, fetcher, 300);
        expect(res1).toEqual({ id: "123", title: "Smart TV" });
        expect(fetcher).toHaveBeenCalledTimes(1);

        // 2. Cache hit (fetcher should not be called again)
        const res2 = await cacheService.getOrSet(key, fetcher, 300);
        expect(res2).toEqual({ id: "123", title: "Smart TV" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("transparently falls back to fetcher when Redis is disconnected", async () => {
        (mockRedis as any).status = "close";
        const fetcher = vi.fn().mockResolvedValue({ status: "db-fallback" });

        const result = await cacheService.getOrSet("disconnected:key", fetcher, 60);
        expect(result).toEqual({ status: "db-fallback" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("transparently falls back to fetcher when Redis throws an exception", async () => {
        (mockRedis.get as any).mockRejectedValueOnce(new Error("Redis connection timed out"));
        const fetcher = vi.fn().mockResolvedValue({ status: "db-fallback-on-error" });

        const result = await cacheService.getOrSet("error:key", fetcher, 60);
        expect(result).toEqual({ status: "db-fallback-on-error" });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("deletes specific cache keys", async () => {
        await cacheService.set("key:1", "val1");
        await cacheService.set("key:2", "val2");

        await cacheService.del("key:1");
        expect(await cacheService.get("key:1")).toBeNull();
        expect(await cacheService.get("key:2")).toBe("val2");
    });

    it("invalidates keys matching pattern using non-blocking SCAN", async () => {
        await cacheService.set("cache:product:1", { id: "1" });
        await cacheService.set("cache:product:2", { id: "2" });
        await cacheService.set("cache:category:1", { id: "1" });

        await cacheService.invalidatePattern("cache:product:*");
        expect(mockRedis.scan).toHaveBeenCalled();
    });

    it("flushes namespace safely", async () => {
        await cacheService.flushNamespace("cache:custom");
        expect(mockRedis.scan).toHaveBeenCalled();
    });
});
