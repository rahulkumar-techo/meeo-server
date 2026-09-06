import redis from "@/lib/redis.js";
import { Keys } from "@/const/keys.js";

export const AUTH_CONTEXT_TTL_SECONDS = 30;

type CachedAuthContext = {
    userId: string;
    email: string | null;
    roles: string[];
    permissions: string[];
    sessionId?: string;
    sessionExpiresAt?: string;
};

// Keep the cache optional: local development and tests can authenticate with PostgreSQL alone.
const cacheEnabled = () => Boolean(process.env.REDIS_URL) && process.env.NODE_ENV !== "test" && !process.env.VITEST;

export const getAuthContext = async (userId: string, sessionId?: string) => {
    if (!cacheEnabled()) return null;

    try {
        // A session-specific key prevents permissions from one login session being reused by another.
        const value = await redis.get(Keys.AUTH_CONTEXT(userId, sessionId));
        if (!value) return null;

        const context = JSON.parse(value) as CachedAuthContext;
        if (context.userId !== userId) return null;
        if (sessionId && context.sessionId !== sessionId) return null;
        if (context.sessionExpiresAt && new Date(context.sessionExpiresAt) <= new Date()) return null;

        return context;
    } catch {
        return null;
    }
};

export const setAuthContext = async (context: CachedAuthContext) => {
    if (!cacheEnabled()) return;

    try {
        // The short TTL limits stale permissions while avoiding a database query on every request.
        const key = Keys.AUTH_CONTEXT(context.userId, context.sessionId);
        await redis.set(
            key,
            JSON.stringify(context),
            "EX",
            AUTH_CONTEXT_TTL_SECONDS,
        );
        await redis.sadd(Keys.AUTH_CONTEXT_INDEX(context.userId), key);
        await redis.expire(Keys.AUTH_CONTEXT_INDEX(context.userId), AUTH_CONTEXT_TTL_SECONDS);
    } catch {
        // Authentication continues against PostgreSQL when Redis is unavailable.
    }
};

export const invalidateAuthContext = async (userId: string, sessionId?: string) => {
    if (!cacheEnabled()) return;

    try {
        // Target one session for logout; use the user index for role/status changes affecting all sessions.
        if (sessionId) {
            await redis.del(Keys.AUTH_CONTEXT(userId, sessionId));
            return;
        }

        const indexKey = Keys.AUTH_CONTEXT_INDEX(userId);
        const contextKeys = await redis.smembers(indexKey);
        if (contextKeys.length > 0) await redis.del(...contextKeys);
        await redis.del(indexKey);
    } catch {
        // Cache invalidation must not make logout or account administration fail.
    }
};
