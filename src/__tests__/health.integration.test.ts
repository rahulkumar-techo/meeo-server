import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "health-test-jwt-secret";

const { mockPrismaHealth, mockRedisHealth, mockQueueMetrics } = vi.hoisted(() => ({
    mockPrismaHealth: vi.fn(),
    mockRedisHealth: {
        status: "ready",
        ping: vi.fn().mockResolvedValue("PONG"),
        keys: vi.fn().mockResolvedValue(["worker:heartbeat:worker-1"]),
        mget: vi.fn().mockResolvedValue([
            JSON.stringify({
                workerId: "worker-1",
                workerName: "event-worker",
                status: "running",
                pid: 1234,
                queues: ["domain-events", "dead-letter-events"],
                concurrency: 5,
                lastHeartbeatAt: new Date().toISOString(),
                uptimeSeconds: 120,
            }),
        ]),
    },
    mockQueueMetrics: vi.fn().mockResolvedValue({
        domainEvents: { waiting: 2, active: 1, completed: 150, failed: 0, delayed: 0 },
        deadLetter: { waiting: 0, active: 0, completed: 5, failed: 1, delayed: 0 },
        timestamp: new Date().toISOString(),
    }),
}));

vi.mock("../lib/prisma.js", () => ({
    prisma: {},
    checkDatabaseHealth: mockPrismaHealth,
}));

vi.mock("../lib/redis.js", () => ({
    default: mockRedisHealth,
}));

vi.mock("../lib/queue.js", () => ({
    getQueueMetrics: mockQueueMetrics,
}));

vi.mock("../lib/mail.js", () => ({
    mailTransporter: {
        verify: vi.fn().mockResolvedValue(true),
    },
}));

import healthRouter, { metricsRouter } from "../modules/health/health.route.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { metricsService } from "../common/observability/metrics.service.js";

describe("Health, Readiness & Metrics HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        metricsService.reset();
        mockPrismaHealth.mockResolvedValue({ healthy: true, latencyMs: 3.5 });
    });

    const createTestApp = async () => {
        const app = Fastify({
            requestIdHeader: "x-request-id",
            genReqId: (req) => (req.headers["x-request-id"] as string) || "generated-req-id-123",
        });
        app.setErrorHandler(errorHandler);

        app.addHook("onRequest", async (request, reply) => {
            reply.header("x-request-id", request.id);
            (request as any).startTime = performance.now();
        });

        app.addHook("onResponse", async (request, reply) => {
            const startTime = (request as any).startTime || performance.now();
            const durationMs = Number((performance.now() - startTime).toFixed(2));
            const route = request.routeOptions?.url || request.url;
            metricsService.recordHttpRequest(request.method, route, reply.statusCode, durationMs);
        });

        await app.register(cookie);
        await app.register(healthRouter, { prefix: "/health" });
        await app.register(metricsRouter, { prefix: "/metrics" });

        // Dummy endpoint for testing error request ID propagation
        app.get("/api/test-error", async () => {
            throw new Error("Deliberate test error");
        });

        return app;
    };

    it("returns 200 OK for liveness probe via GET /health/live", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/health/live",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.success).toBe(true);
        expect(json.data.status).toBe("healthy");
        expect(json.data.pid).toBeDefined();
        expect(json.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it("returns 200 OK with component breakdown for readiness probe via GET /health/ready", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/health/ready",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.success).toBe(true);
        expect(json.data.status).toBe("healthy");
        expect(json.data.components.database.status).toBe("healthy");
        expect(json.data.components.redis.status).toBe("healthy");
    });

    it("returns 503 Service Unavailable when database connection is unhealthy on GET /health/ready", async () => {
        const app = await createTestApp();
        mockPrismaHealth.mockResolvedValueOnce({
            healthy: false,
            latencyMs: 15.2,
            error: "Connection refused: database down",
        });

        const res = await app.inject({
            method: "GET",
            url: "/health/ready",
        });

        expect(res.statusCode).toBe(503);
        const json = res.json();
        expect(json.success).toBe(false);
        expect(json.data.status).toBe("unhealthy");
        expect(json.data.components.database.status).toBe("unhealthy");
        expect(json.data.components.database.message).toContain("database down");
    });

    it("returns worker heartbeats via GET /health/workers", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/health/workers",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.success).toBe(true);
        expect(json.data.activeWorkersCount).toBe(1);
        expect(json.data.workers[0].workerName).toBe("event-worker");
    });

    it("returns BullMQ queue metrics via GET /health/queues", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/health/queues",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.success).toBe(true);
        expect(json.data.domainEvents.waiting).toBe(2);
        expect(mockQueueMetrics).toHaveBeenCalled();
    });

    it("exposes Prometheus text format metrics via GET /metrics", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/metrics",
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/plain");
        expect(res.body).toContain("# HELP http_requests_total");
        expect(res.body).toContain("process_memory_rss_bytes");
    });

    it("exposes JSON metrics snapshot via GET /metrics/json", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/metrics/json",
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.success).toBe(true);
        expect(json.data.http).toBeDefined();
        expect(json.data.database).toBeDefined();
        expect(json.data.process).toBeDefined();
    });

    it("generates and propagates x-request-id in headers and error responses", async () => {
        const app = await createTestApp();

        const customRequestId = "client-trace-id-9999";
        const res = await app.inject({
            method: "GET",
            url: "/api/test-error",
            headers: {
                "x-request-id": customRequestId,
            },
        });

        expect(res.statusCode).toBe(500);
        expect(res.headers["x-request-id"]).toBe(customRequestId);
        const json = res.json();
        expect(json.success).toBe(false);
        expect(json.requestId).toBe(customRequestId);
    });
});
