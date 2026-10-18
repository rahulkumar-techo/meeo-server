import { describe, expect, it } from "vitest";
import { PrometheusNormalizer } from "@/modules/observability/normalizers/prometheus.normalizer.js";
import { LokiNormalizer } from "@/modules/observability/normalizers/loki.normalizer.js";
import { OBSERVABILITY_PRESETS } from "@/modules/observability/config/observability.config.js";
import type {
    LokiRawData,
    PrometheusMetricResult,
    PrometheusRawData,
} from "@/modules/observability/types/observability.types.js";

describe("Observability Platform - PrometheusNormalizer", () => {
    it("correctly normalizes Prometheus matrix (range query) output for frontend charts", () => {
        const rawMatrix: PrometheusRawData<PrometheusMetricResult<[number, string][]>> = {
            resultType: "matrix",
            result: [
                {
                    metric: {
                        __name__: "http_requests_total",
                        method: "GET",
                        route: "/api/v1/catalog/products",
                        status: "200",
                    },
                    values: [
                        [1713400000, "10.5"],
                        [1713400015, "25.0"],
                        [1713400030, "40.25"],
                    ],
                },
            ],
        };

        const series = PrometheusNormalizer.normalizeMatrix(rawMatrix);

        expect(series).toHaveLength(1);
        const item = series[0]!;

        expect(item.metricName).toBe("http_requests_total");
        expect(item.name).toBe("GET /api/v1/catalog/products [200]");
        expect(item.points).toHaveLength(3);
        expect(item.points[0]).toEqual({
            timestamp: 1713400000000,
            timeIso: new Date(1713400000000).toISOString(),
            value: 10.5,
        });

        // Verify summary statistics
        expect(item.summary.count).toBe(3);
        expect(item.summary.min).toBe(10.5);
        expect(item.summary.max).toBe(40.25);
        expect(item.summary.latest).toBe(40.25);
        expect(item.summary.avg).toBeCloseTo(25.25, 2);
    });

    it("correctly normalizes Prometheus vector (instant query) output", () => {
        const rawVector: PrometheusRawData<PrometheusMetricResult<[number, string]>> = {
            resultType: "vector",
            result: [
                {
                    metric: {
                        __name__: "process_resident_memory_bytes",
                        job: "meeo-api",
                    },
                    value: [1713400000, "104857600"],
                },
            ],
        };

        const results = PrometheusNormalizer.normalizeVector(rawVector);

        expect(results).toHaveLength(1);
        const item = results[0]!;

        expect(item.metricName).toBe("process_resident_memory_bytes");
        expect(item.name).toContain("meeo-api");
        expect(item.timestamp).toBe(1713400000000);
        expect(item.value).toBe(104857600);
    });
});

describe("Observability Platform - LokiNormalizer", () => {
    it("correctly parses structured JSON logs (Pino/Fastify) and nanosecond timestamps", () => {
        const rawLoki: LokiRawData = {
            resultType: "streams",
            result: [
                {
                    stream: {
                        container: "meeo-api",
                        job: "docker",
                        stream: "stdout",
                    },
                    values: [
                        [
                            "1713400000000000000",
                            JSON.stringify({
                                level: 30,
                                time: 1713400000000,
                                pid: 1,
                                reqId: "req-12345",
                                msg: "GET /api/v1/catalog 200 12.50ms",
                            }),
                        ],
                        [
                            "1713400005000000000",
                            JSON.stringify({
                                level: 50,
                                time: 1713400005000,
                                pid: 1,
                                error: "Database connection timeout",
                            }),
                        ],
                    ],
                },
            ],
        };

        const logs = LokiNormalizer.normalizeStreams(rawLoki);

        expect(logs).toHaveLength(2);

        // First log (Pino info level 30)
        expect(logs[0]!.level).toBe("info");
        expect(logs[0]!.message).toBe("GET /api/v1/catalog 200 12.50ms");
        expect(logs[0]!.timestampNs).toBe("1713400000000000000");
        expect(logs[0]!.structured).toBeDefined();
        expect(logs[0]!.structured?.reqId).toBe("req-12345");
        expect(logs[0]!.labels.container).toBe("meeo-api");

        // Second log (Pino error level 50)
        expect(logs[1]!.level).toBe("error");
        expect(logs[1]!.message).toBe("Database connection timeout");
    });

    it("correctly infers log levels and handles unformatted plain text logs", () => {
        const rawLoki: LokiRawData = {
            resultType: "streams",
            result: [
                {
                    stream: { job: "docker" },
                    values: [
                        ["1713400010000000000", "[WARN] Cache miss for product:prod_999"],
                        ["1713400020000000000", "Unhandled EXCEPTION caught in worker"],
                    ],
                },
            ],
        };

        const logs = LokiNormalizer.normalizeStreams(rawLoki);

        expect(logs).toHaveLength(2);
        expect(logs[0]!.level).toBe("warn");
        expect(logs[0]!.message).toContain("Cache miss");

        expect(logs[1]!.level).toBe("error");
        expect(logs[1]!.message).toContain("Unhandled EXCEPTION");
    });

    it("normalizes live WebSocket chunks on the fly", () => {
        const liveChunk = {
            streams: [
                {
                    stream: { container: "meeo-api" },
                    values: [
                        [
                            "1713400030000000000",
                            JSON.stringify({ level: 40, msg: "Rate limit reached for IP 127.0.0.1" }),
                        ],
                    ] as [string, string][],
                },
            ],
        };

        const logs = LokiNormalizer.normalizeLiveChunk(liveChunk);

        expect(logs).toHaveLength(1);
        expect(logs[0]!.level).toBe("warn");
        expect(logs[0]!.message).toBe("Rate limit reached for IP 127.0.0.1");
    });
});

describe("Observability Platform - Presets", () => {
    it("provides standard predefined dashboard presets", () => {
        expect(OBSERVABILITY_PRESETS.length).toBeGreaterThanOrEqual(5);

        const ids = OBSERVABILITY_PRESETS.map((p) => p.id);
        expect(ids).toContain("http_request_rate");
        expect(ids).toContain("http_error_rate");
        expect(ids).toContain("http_latency_p95");
        expect(ids).toContain("process_cpu_usage");
        expect(ids).toContain("process_memory_mb");
    });
});
