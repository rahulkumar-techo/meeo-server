import redis from "@/lib/redis.js";
import { Keys } from "@/const/keys.js";

export const AUTH_CONTEXT_TTL_SECONDS = 300; // 5 minutes

export type CachedAuthContext = {
    userId: string;
    email: string | null;
    roles: string[];
    permissions: string[];
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    roleDetails?: Array<{
        id?: string;
        name?: string;
        description?: string | null;
        permissions?: Array<{
            id?: string;
            name?: string;
            description?: string | null;
        }>;
    }>;
    sessionId?: string;
    sessionExpiresAt?: string;
};

// Keep the cache optional: local development and tests can authenticate with PostgreSQL alone.
const cacheEnabled = () => Boolean(process.env.REDIS_URL) && process.env.NODE_ENV !== "test" && !process.env.VITEST;

export const getAuthContext = async (userId: string, sessionId?: string): Promise<CachedAuthContext | null> => {
    if (!cacheEnabled()) return null;

    try {
        // A session-specific key prevents permissions from one login session being reused by another.
        const value = await redis.get(Keys.AUTH_CONTEXT(userId, sessionId));
        if (!value) return null;

        const context = JSON.parse(value) as CachedAuthContext;
        if (context.userId !== userId && context.id !== userId) return null;
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
        // Single Source of Truth: stores complete auth context + profile in 1 pipelined roundtrip
        const userId = context.userId || context.id || "";
        const key = Keys.AUTH_CONTEXT(userId, context.sessionId);
        const indexKey = Keys.AUTH_CONTEXT_INDEX(userId);

        const pipeline = redis.pipeline();
        pipeline.set(key, JSON.stringify(context), "EX", AUTH_CONTEXT_TTL_SECONDS);
        pipeline.sadd(indexKey, key);
        pipeline.expire(indexKey, AUTH_CONTEXT_TTL_SECONDS);
        await pipeline.exec();
    } catch {
        // Authentication continues against PostgreSQL when Redis is unavailable.
    }
};

export const invalidateAuthContext = async (userId: string, sessionId?: string) => {
    if (!cacheEnabled()) return;

    try {
        const pipeline = redis.pipeline();

        // Target one session for logout; use the user index for role/status changes affecting all sessions.
        if (sessionId) {
            pipeline.del(Keys.AUTH_CONTEXT(userId, sessionId));
            await pipeline.exec();
            return;
        }

        const indexKey = Keys.AUTH_CONTEXT_INDEX(userId);
        const contextKeys = await redis.smembers(indexKey);
        if (contextKeys.length > 0) {
            pipeline.del(...contextKeys);
        }
        pipeline.del(indexKey);
        await pipeline.exec();
    } catch {
        // Cache invalidation must not make logout or account administration fail.
    }
};


