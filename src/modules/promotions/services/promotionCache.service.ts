import redis from "@/lib/redis.js";
import type { Promotion } from "@/generated/prisma/client.js";

const CACHE_TTL_SECONDS = 300; // 5 minutes
const PREFIX = "meeo:promotions";
const AUTO_PROMOS_KEY = `${PREFIX}:active:automatic`;

export class PromotionCacheService {
    /**
     * Retrieves cached active automatic promotions.
     */
    async getActiveAutomaticPromotions(): Promise<Promotion[] | null> {
        try {
            const data = await redis.get(AUTO_PROMOS_KEY);
            if (!data) return null;
            return JSON.parse(data);
        } catch (err) {
            console.warn("[PromotionCache] Redis get error (falling back to DB):", err);
            return null;
        }
    }

    /**
     * Caches the list of active automatic promotions.
     */
    async setActiveAutomaticPromotions(promotions: Promotion[]): Promise<void> {
        try {
            await redis.setex(AUTO_PROMOS_KEY, CACHE_TTL_SECONDS, JSON.stringify(promotions));
        } catch (err) {
            console.warn("[PromotionCache] Redis set error:", err);
        }
    }

    /**
     * Retrieves an active code-based promotion from cache.
     */
    async getPromotionByCode(code: string): Promise<Promotion | null> {
        try {
            const key = `${PREFIX}:code:${code.toUpperCase()}`;
            const data = await redis.get(key);
            if (!data) return null;
            return JSON.parse(data);
        } catch (err) {
            console.warn("[PromotionCache] Redis get code error:", err);
            return null;
        }
    }

    /**
     * Caches a code-based promotion.
     */
    async setPromotionByCode(code: string, promo: Promotion): Promise<void> {
        try {
            const key = `${PREFIX}:code:${code.toUpperCase()}`;
            await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(promo));
        } catch (err) {
            console.warn("[PromotionCache] Redis set code error:", err);
        }
    }

    /**
     * Invalidates all promotion caches when promotions are updated or status changed.
     */
    async invalidateAll(): Promise<void> {
        try {
            const keys = await redis.keys(`${PREFIX}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.warn("[PromotionCache] Redis invalidate error:", err);
        }
    }

    /**
     * Invalidates cache for a specific promo code.
     */
    async invalidateCode(code: string): Promise<void> {
        try {
            await redis.del(`${PREFIX}:code:${code.toUpperCase()}`, AUTO_PROMOS_KEY);
        } catch (err) {
            console.warn("[PromotionCache] Redis invalidate code error:", err);
        }
    }
}

export const promotionCacheService = new PromotionCacheService();
