import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "@/common/errors/error-handler.js";
import { observabilityRouter } from "@/modules/observability/routes/observability.route.js";
import { prometheusClient } from "@/modules/observability/clients/prometheus.client.js";
import { lokiClient } from "@/modules/observability/clients/loki.client.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

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
});
