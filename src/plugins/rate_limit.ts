import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { getClientIp } from "@/common/security/clientIp.js";
import redis from "@/lib/redis.js";

export async function appRateLimit(app: FastifyInstance) {
    await app.register(rateLimit, {
        global: true,
        max: 300,
        timeWindow: "1 minute",
        // Connect to Redis for shared cluster state in production
        redis: process.env.NODE_ENV !== "test" ? redis : undefined,
        // Ban aggressive flooders sending rapid-fire continuous requests
        ban: 100,
        hook: "onRequest", // Intercept at earliest possible stage before body parsing
        keyGenerator: (req: FastifyRequest) => {
            return getClientIp(req);
        },
        errorResponseBuilder: (req, context) => {
            const retryAfterSec = Math.ceil(context.ttl / 1000);

            // If an attacker is banned for continuous rapid-fire flooding, destroy socket immediately
            if ((context as any).ban) {
                req.raw.destroy();
            }

            return {
                statusCode: 429,
                error: "Too Many Requests",
                success: false,
                message: `Rate limit exceeded. System protected against rapid requests. Retry in ${retryAfterSec} seconds.`,
                retryAfter: retryAfterSec,
            };
        },
        addHeaders: {
            "x-ratelimit-limit": true,
            "x-ratelimit-remaining": true,
            "x-ratelimit-reset": true,
            "retry-after": true,
        },
        // Allow custom route-level overrides
        allowList: (req: FastifyRequest) => {
            // Health check, ping, and static assets bypass rate limiting
            const url = req.url;
            return url === "/health" || url === "/ping" || url.startsWith("/docs/static");
        },
    });
}