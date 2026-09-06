import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, expect, it } from "vitest";
import helmetPlugin from "../plugins/helmet.plugin.js";
import { appRateLimit } from "../plugins/rate_limit.js";
import { sanitizeInput } from "../common/security/sanitizer.js";
import { generateCsrfToken, setCsrfCookie, validateCsrfProtection } from "../common/security/csrf.js";
import { errorHandler } from "../common/errors/error-handler.js";
import cors from "@fastify/cors";

describe("Security Hardening HTTP Integration Tests", () => {
    const buildSecureApp = async () => {
        const app = Fastify({
            bodyLimit: 1024, // 1KB for fast test validation of body limits
        });
        app.setErrorHandler(errorHandler);
        await app.register(helmetPlugin);
        await app.register(cors, {
            origin: ["http://localhost:3000", "http://localhost:5173"],
            credentials: true,
            exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-CSRF-Token"],
        });
        await app.register(cookie);
        await appRateLimit(app);

        app.addHook("preValidation", async (request) => {
            if (request.body && typeof request.body === "object") {
                request.body = sanitizeInput(request.body);
            }
        });

        // Test routes
        app.get("/test-headers", async () => ({ status: "ok" }));
        app.post("/test-sanitize", async (req) => ({ received: req.body }));
        app.post("/test-csrf", {
            preHandler: async (req) => {
                validateCsrfProtection(req);
            },
        }, async () => ({ status: "csrf-verified" }));

        app.get("/api/auth/csrf", async (_req, reply) => {
            const token = generateCsrfToken();
            setCsrfCookie(reply, token);
            return reply.send({ success: true, csrfToken: token });
        });

        return app;
    };

    describe("Security Headers (Helmet)", () => {
        it("returns hardened security headers on HTTP responses", async () => {
            const app = await buildSecureApp();

            const res = await app.inject({
                method: "GET",
                url: "/test-headers",
            });

            expect(res.statusCode).toBe(200);
            expect(res.headers["x-frame-options"]).toBe("DENY");
            expect(res.headers["x-content-type-options"]).toBe("nosniff");
            expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
            expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
            expect(res.headers["permissions-policy"]).toContain("camera=()");

            await app.close();
        });
    });

    describe("CORS Security & Preflight", () => {
        it("handles preflight OPTIONS request from whitelisted origin with credentials", async () => {
            const app = await buildSecureApp();

            const res = await app.inject({
                method: "OPTIONS",
                url: "/test-headers",
                headers: {
                    origin: "http://localhost:3000",
                    "access-control-request-method": "GET",
                },
            });

            expect(res.statusCode).toBe(204);
            expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
            expect(res.headers["access-control-allow-credentials"]).toBe("true");

            await app.close();
        });
    });

    describe("Request Payload Size Limit", () => {
        it("rejects payloads exceeding configured body limit with 413 Payload Too Large", async () => {
            const app = await buildSecureApp();

            const largeString = "a".repeat(2048); // Exceeds 1KB test limit
            const res = await app.inject({
                method: "POST",
                url: "/test-sanitize",
                payload: { data: largeString },
            });

            expect(res.statusCode).toBe(413);
            const json = res.json();
            expect(json.success).toBe(false);
            expect(json.message).toContain("payload too large");

            await app.close();
        });
    });

    describe("Input Sanitization & Prototype Pollution Filter", () => {
        it("sanitizes prototype pollution attempts in incoming request bodies", async () => {
            const app = await buildSecureApp();

            const res = await app.inject({
                method: "POST",
                url: "/test-sanitize",
                payload: {
                    title: "Normal Title",
                    description: '<script>alert("xss")</script>Safe Content',
                    __proto__: { isAdmin: true },
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.received.title).toBe("Normal Title");
            expect(json.received.description).toBe("Safe Content");
            expect(Object.prototype.hasOwnProperty.call(json.received, "__proto__")).toBe(false);
            expect((Object.prototype as any).isAdmin).toBeUndefined();
            expect(json.received.isAdmin).toBeUndefined();

            await app.close();
        });
    });

    describe("CSRF Protection & Token Endpoint", () => {
        it("generates CSRF token and sets cookie via GET /api/auth/csrf", async () => {
            const app = await buildSecureApp();

            const res = await app.inject({
                method: "GET",
                url: "/api/auth/csrf",
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.csrfToken).toHaveLength(64);
            expect(res.headers["set-cookie"]).toContain("csrfToken=");

            await app.close();
        });

        it("verifies matching CSRF double-submit token on protected mutating routes", async () => {
            const app = await buildSecureApp();
            const token = generateCsrfToken();

            const res = await app.inject({
                method: "POST",
                url: "/test-csrf",
                headers: {
                    "x-csrf-token": token,
                    cookie: `csrfToken=${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json().status).toBe("csrf-verified");

            await app.close();
        });
    });
});
