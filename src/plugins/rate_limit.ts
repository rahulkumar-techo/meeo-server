import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { getClientIp } from "@/common/security/clientIp.js";

export async function appRateLimit(app: FastifyInstance) {
    await app.register(rateLimit, {
        global: true,
        max: 300,
        timeWindow: "1 minute",
        keyGenerator: (req: FastifyRequest) => {
            return getClientIp(req);
        },
        errorResponseBuilder: (_req, context) => {
            const retryAfterSec = Math.ceil(context.ttl / 1000);
            return {
                statusCode: 429,
                error: "Too Many Requests",
                success: false,
                message: `Rate limit exceeded. Too many requests, please try again in ${retryAfterSec} seconds.`,
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