import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "@/common/errors/error-handler.js";
import { observabilityRouter } from "@/modules/observability/routes/observability.route.js";
import { prometheusClient } from "@/modules/observability/clients/prometheus.client.js";
import { lokiClient } from "@/modules/observability/clients/loki.client.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { observabilityService } from "@/modules/observability/services/observability.service.js";

describe("Observability Fastify Endpoints Integration Tests", () => {
    const buildTestApp = async (userPermissions: string[] = [PERMISSIONS.SYSTEM_MANAGE]) => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);

        // Mock auth plugin decorators
        app.decorate("authenticate", async (request) => {
            (request as any).user = {
                userId: "admin-1",
                id: "admin-1",
                email: "admin@meeo.com",
                roles: ["ADMIN"],
                permissions: userPermissions,
            };
        });

        app.decorate("requireAnyPermission", (requiredPerms: string[]) => {
            return async (request: any) => {
                const perms = request.user?.permissions || [];
                const hasMatch = requiredPerms.some((p) => perms.includes(p));
                if (!hasMatch) {
                    throw new AppError("Forbidden: Insufficient privileges", 403);
                }
            };
        });

        await app.register(observabilityRouter, { prefix: "/api/v1/observability" });
        await app.ready();
        return app;
    };

    it("GET /api/v1/observability/metrics/presets returns predefined dashboard metrics", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/presets",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThanOrEqual(5);

        const ids = body.data.map((p: any) => p.id);
        expect(ids).toContain("http_request_rate");
    });

    it("GET /api/v1/observability/metrics/range queries Prometheus and returns normalized series", async () => {
        const app = await buildTestApp();

        vi.spyOn(prometheusClient, "queryRange").mockResolvedValueOnce({
            resultType: "matrix",
            result: [
                {
                    metric: {
                        __name__: "process_cpu_user_seconds_total",
                        job: "meeo-api",
                    },
                    values: [
                        [1713400000, "12.5"],
                        [1713400015, "15.0"],
                    ],
                },
            ],
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/range?preset=process_cpu_usage",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.seriesCount).toBe(1);

        const series = body.data.series[0];
        expect(series.metricName).toBe("process_cpu_user_seconds_total");
        expect(series.points).toHaveLength(2);
        expect(series.summary.latest).toBe(15.0);
    });

    it("GET /api/v1/observability/logs/query queries Loki and returns normalized structured logs", async () => {
        const app = await buildTestApp();

        vi.spyOn(lokiClient, "queryRange").mockResolvedValueOnce({
            resultType: "streams",
            result: [
                {
                    stream: { container: "meeo-api" },
                    values: [
                        [
                            "1713400000000000000",
                            JSON.stringify({
                                level: 30,
                                time: 1713400000000,
                                msg: "User logged in successfully",
                                userId: "user-99",
                            }),
                        ],
                    ],
                },
            ],
        });

        const res = await app.inject({
            method: "GET",
            url: '/api/v1/observability/logs/query?query={container="meeo-api"}',
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.total).toBe(1);

        const log = body.data.logs[0];
        expect(log.level).toBe("info");
        expect(log.message).toBe("User logged in successfully");
        expect(log.structured.userId).toBe("user-99");
    });

    it("rejects unauthorized users without required permissions", async () => {
        // App where user has no observability permissions
        const app = await buildTestApp(["order:read"]);

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/presets",
        });

        expect(res.statusCode).toBe(403);
    });

    it("GET /api/v1/observability/queues returns BullMQ queue overview and telemetry", async () => {
        const app = await buildTestApp();

        vi.spyOn(observabilityService, "getQueueOverview").mockResolvedValueOnce({
            queues: [
                {
                    name: "domain-events",
                    displayName: "Domain Events Queue",
                    isPaused: false,
                    counts: { active: 0, waiting: 0, completed: 10, failed: 0, delayed: 0, paused: 0 },
                    throughputRps: 2.5,
                    averageLatencyMs: 40.0,
                },
                {
                    name: "dead-letter-events",
                    displayName: "Dead Letter Queue (DLQ)",
                    isPaused: false,
                    counts: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
                    throughputRps: 0.1,
                    averageLatencyMs: 12.0,
                },
            ],
            recentJobs: [],
            summary: {
                totalQueues: 2,
                activeInFlight: 0,
                throttled: 0,
                succeeded: 10,
                failed: 0,
                dlqDepth: 0,
                successRate: 100,
                averageExecutionLatencyMs: 40.0,
                workerNodes: { total: 1, healthy: 1, degraded: 0, totalConcurrency: 5 },
            } as any,
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/queues",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty("queues");
        expect(body.data).toHaveProperty("summary");
    });

    it("GET /api/v1/observability/metrics/range falls back to in-memory telemetry when Prometheus is offline (no 503)", async () => {
        const app = await buildTestApp();

        // Simulate Prometheus connection failure
        vi.spyOn(prometheusClient, "queryRange").mockRejectedValueOnce(
            new AppError("Failed to connect to Prometheus: Connection refused", 503),
        );

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/range?preset=process_memory_mb",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.seriesCount).toBeGreaterThanOrEqual(1);
        expect(body.data.series[0].points.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/v1/observability/topology returns React Flow nodes and edges", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/topology",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.nodes)).toBe(true);
        expect(Array.isArray(body.data.edges)).toBe(true);
        expect(body.data.nodes.length).toBeGreaterThanOrEqual(4);
    });

    it("GET /api/v1/observability/traces returns OpenTelemetry traces", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/traces",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
    });

    it("GET /api/v1/observability/systemInfo returns RAM, CPU, Process, Threads and out of given stats", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/systemInfo",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();

        // Memory validation
        expect(body.data.ram.system.totalBytes).toBeGreaterThan(0);
        expect(body.data.ram.system.freeBytes).toBeGreaterThan(0);
        expect(body.data.ram.process.rssBytes).toBeGreaterThan(0);
        expect(body.data.ram.process.heapLimitBytes).toBeGreaterThan(0);
        expect(body.data.ram.outOfGiven.processRssPercentOfSystem).toBeDefined();
        expect(body.data.ram.outOfGiven.heapUsedPercentOfHeapLimit).toBeDefined();

        // CPU validation
        expect(body.data.cpu.cores).toBeGreaterThan(0);
        expect(body.data.cpu.model).toBeDefined();
        expect(body.data.cpu.processUsage.totalCpuSeconds).toBeGreaterThanOrEqual(0);
        expect(body.data.cpu.outOfGiven.coresGiven).toBeGreaterThan(0);

        // Process validation
        expect(body.data.process.pid).toBe(process.pid);
        expect(body.data.process.nodeVersion).toBe(process.version);
        expect(body.data.process.uptimeFormatted).toBeDefined();

        // Threads validation
        expect(body.data.threads.hardwareCores).toBeGreaterThan(0);
        expect(body.data.threads.uvThreadPoolSize).toBeGreaterThan(0);
        expect(body.data.threads.activeHandlesCount).toBeGreaterThanOrEqual(0);

        // Summary validation
        expect(body.data.summary.ram.systemMemoryUsed).toBeDefined();
        expect(body.data.summary.cpu.processCpuOfTotalCores).toBeDefined();
        expect(body.data.summary.threads.uvThreadPoolGiven).toBeDefined();
    });

    it("GET /api/v1/observability/metrics/prom exports Prometheus scrape format", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/prom",
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/plain");
        expect(res.body).toBeDefined();
    });

    it("GET /api/v1/observability/metrics/json returns in-memory JSON metrics snapshot", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/metrics/json",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.http).toBeDefined();
        expect(body.data.database).toBeDefined();
        expect(body.data.process).toBeDefined();
    });

    it("GET /api/v1/observability/cpu returns CPU cores, model, and load averages", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/cpu",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.cores).toBeGreaterThan(0);
        expect(body.data.loadAverage).toBeDefined();
        expect(body.data.processUsage).toBeDefined();
    });

    it("GET /api/v1/observability/memory returns RAM and V8 heap limits", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/memory",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.system.totalBytes).toBeGreaterThan(0);
        expect(body.data.process.rssBytes).toBeGreaterThan(0);
        expect(body.data.outOfGiven.processRssPercentOfSystem).toBeDefined();
    });

    it("GET /api/v1/observability/disk returns filesystem usage and health status", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/disk",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.status).toMatch(/healthy|warning|critical/);
        expect(body.data.usagePercent).toBeGreaterThanOrEqual(0);
    });

    it("GET /api/v1/observability/network returns network interfaces and socket handles", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/network",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data.interfaces)).toBe(true);
        expect(body.data.activeSocketHandlesCount).toBeGreaterThanOrEqual(0);
    });

    it("GET /api/v1/observability/processes returns uptime, event loop lag, and threadpool", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/processes",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.pid).toBe(process.pid);
        expect(body.data.eventLoopLagMs).toBeDefined();
        expect(body.data.uptimeFormatted).toBeDefined();
    });

    it("GET /api/v1/observability/polling-policy returns server-managed windows, refresh intervals, and alert cooldown", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/observability/polling-policy",
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
        expect(body.data.allowedWindows).toEqual(["15m", "1h", "6h", "24h"]);
        expect(body.data.allowedIntervals).toEqual(["5s", "15s", "30s", "Off"]);
        expect(body.data.minIntervalSeconds).toBe(5);
        expect(body.data.allowedAlertCooldownMinutes).toEqual([5, 10, 15, 30, 60]);
        expect(body.data.alertCooldownMinutes).toBeGreaterThanOrEqual(1);
        expect(body.data.cacheTier).toContain("L1-Memory");
    });

    it("PUT /api/v1/observability/polling-policy updates valid policies and rejects rogue custom intervals", async () => {
        const app = await buildTestApp([PERMISSIONS.SYSTEM_MANAGE]);

        // 1. Valid update (Window: 1h, Auto: 30s, Cooldown: 5m)
        const validRes = await app.inject({
            method: "PUT",
            url: "/api/v1/observability/polling-policy",
            payload: {
                activeWindow: "1h",
                activeInterval: "30s",
                alertCooldownMinutes: 5,
            },
        });

        expect(validRes.statusCode).toBe(200);
        const validBody = JSON.parse(validRes.payload);
        expect(validBody.success).toBe(true);
        expect(validBody.data.activeWindow).toBe("1h");
        expect(validBody.data.activeInterval).toBe("30s");
        expect(validBody.data.alertCooldownMinutes).toBe(5);

        // 2. Hacker / Rogue custom interval (e.g. 100ms or 1s) is blocked by server-side validation
        const rogueRes = await app.inject({
            method: "PUT",
            url: "/api/v1/observability/polling-policy",
            payload: {
                activeInterval: "1s",
            },
        });

        expect(rogueRes.statusCode).toBe(400);
    });
});
