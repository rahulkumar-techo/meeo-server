import { beforeEach, describe, expect, it } from "vitest";
import { MetricsService } from "../common/observability/metrics.service.js";
import { ErrorTracker } from "../common/observability/errorTracker.js";
import { HealthService } from "../modules/health/health.service.js";

describe("Observability & Reliability Unit Tests", () => {
    describe("MetricsService", () => {
        let metrics: MetricsService;

        beforeEach(() => {
            metrics = new MetricsService();
        });

        it("records HTTP requests and categorizes status code buckets", () => {
            metrics.recordHttpRequest("GET", "/api/products", 200, 15);
            metrics.recordHttpRequest("POST", "/api/products", 201, 45);
            metrics.recordHttpRequest("GET", "/api/cart", 304, 5);
            metrics.recordHttpRequest("GET", "/api/products/unknown", 404, 8);
            metrics.recordHttpRequest("POST", "/api/checkout", 500, 120);

            const snapshot = metrics.getMetricsSnapshot();
            expect(snapshot.http.totalRequests).toBe(5);
            expect(snapshot.http.statusCodes["2xx"]).toBe(2);
            expect(snapshot.http.statusCodes["3xx"]).toBe(1);
            expect(snapshot.http.statusCodes["4xx"]).toBe(1);
            expect(snapshot.http.statusCodes["5xx"]).toBe(1);
        });

        it("computes accurate latency statistics including p50, p90, and p99", () => {
            for (let i = 1; i <= 100; i++) {
                metrics.recordHttpRequest("GET", "/api/test", 200, i);
            }

            const snapshot = metrics.getMetricsSnapshot();
            const latency = snapshot.http.latencyMs;

            expect(latency.count).toBe(100);
            expect(latency.min).toBe(1);
            expect(latency.max).toBe(100);
            expect(latency.avg).toBe(50.5);
            expect(latency.p50).toBe(51);
            expect(latency.p90).toBe(91);
            expect(latency.p99).toBe(100);
        });

        it("records database queries and slow queries", () => {
            metrics.recordDbQuery(12, false);
            metrics.recordDbQuery(18, false);
            metrics.recordDbQuery(250, true);

            const snapshot = metrics.getMetricsSnapshot();
            expect(snapshot.database.totalQueries).toBe(3);
            expect(snapshot.database.slowQueries).toBe(1);
            expect(snapshot.database.latencyMs.max).toBe(250);
        });

        it("exports metrics in standard Prometheus exposition text format", () => {
            metrics.recordHttpRequest("GET", "/api/v1/products", 200, 25);
            metrics.recordDbQuery(15, false);

            const text = metrics.toPrometheusText();

            expect(text).toContain("# HELP http_requests_total");
            expect(text).toContain("http_requests_total 1");
            expect(text).toContain('http_requests_by_status{status_class="2xx"} 1');
            expect(text).toContain("# HELP database_queries_total");
            expect(text).toContain("database_queries_total 1");
            expect(text).toContain("process_memory_rss_bytes");
            expect(text).toContain("process_uptime_seconds");
        });

        it("tracks process memory and CPU stats", () => {
            const processMetrics = metrics.getProcessMetrics();
            expect(processMetrics.memory.rssMb).toBeGreaterThan(0);
            expect(processMetrics.memory.heapUsedMb).toBeGreaterThan(0);
            expect(processMetrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
        });
    });

    describe("ErrorTracker", () => {
        let errorTracker: ErrorTracker;

        beforeEach(() => {
            errorTracker = new ErrorTracker();
        });

        it("captures exceptions with context and masks sensitive fields", () => {
            const err = new Error("Simulated payment gateway timeout");
            const report = errorTracker.captureException(err, {
                userId: "user-123",
                password: "secret-password",
                creditCard: "4111-2222-3333-4444",
                action: "PROCESS_PAYMENT",
            });

            expect(report.id).toBeDefined();
            expect(report.name).toBe("Error");
            expect(report.message).toBe("Simulated payment gateway timeout");
            expect(report.level).toBe("error");

            expect((report.context as any).userId).toBe("user-123");
            expect((report.context as any).password).toBe("[REDACTED]");
            expect((report.context as any).creditCard).toBe("[REDACTED]");

            const recent = errorTracker.getRecentErrors();
            expect(recent.length).toBe(1);
            expect(recent[0]!.id).toBe(report.id);
        });

        it("stores and associates breadcrumbs with captured errors", () => {
            errorTracker.addBreadcrumb({
                category: "http",
                message: "Incoming POST /api/cart",
                data: { itemId: "item-1" },
            });
            errorTracker.addBreadcrumb({
                category: "auth",
                message: "User authenticated",
            });

            const report = errorTracker.captureException(new Error("Database write lock"));
            const breadcrumbs = (report.context as any)?.recentBreadcrumbs;

            expect(breadcrumbs).toBeDefined();
            expect(breadcrumbs.length).toBe(2);
            expect(breadcrumbs[0].category).toBe("http");
            expect(breadcrumbs[1].category).toBe("auth");
        });
    });

    describe("HealthService Liveness", () => {
        it("returns healthy liveness probe with process information", () => {
            const healthService = new HealthService();
            const live = healthService.getLiveness();

            expect(live.status).toBe("healthy");
            expect(live.pid).toBe(process.pid);
            expect(live.uptimeSeconds).toBeGreaterThanOrEqual(0);
            expect(live.timestamp).toBeDefined();
        });
    });
});
