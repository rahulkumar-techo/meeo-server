export interface LatencyStats {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p99: number;
}

export class MetricsService {
    private startTime: number = Date.now();
    private totalRequests: number = 0;
    private statusCodes: { "2xx": number; "3xx": number; "4xx": number; "5xx": number } = {
        "2xx": 0,
        "3xx": 0,
        "4xx": 0,
        "5xx": 0,
    };
    private routeStats: Map<string, { count: number; totalDurationMs: number }> = new Map();
    private httpDurations: number[] = [];
    private maxLatencySamples = 5000;

    // Database query metrics
    private totalDbQueries: number = 0;
    private slowDbQueries: number = 0;
    private dbDurations: number[] = [];

    /**
     * Records an HTTP request completion with method, route, status, and duration.
     */
    recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number) {
        this.totalRequests++;

        // Status code class
        if (statusCode >= 200 && statusCode < 300) this.statusCodes["2xx"]++;
        else if (statusCode >= 300 && statusCode < 400) this.statusCodes["3xx"]++;
        else if (statusCode >= 400 && statusCode < 500) this.statusCodes["4xx"]++;
        else if (statusCode >= 500) this.statusCodes["5xx"]++;

        // Route statistics
        const routeKey = `${method.toUpperCase()} ${route || "unknown"}`;
        const current = this.routeStats.get(routeKey) || { count: 0, totalDurationMs: 0 };
        current.count++;
        current.totalDurationMs += durationMs;
        this.routeStats.set(routeKey, current);

        // Latency sample buffer
        this.httpDurations.push(durationMs);
        if (this.httpDurations.length > this.maxLatencySamples) {
            this.httpDurations.shift();
        }
    }

    /**
     * Records a database query execution.
     */
    recordDbQuery(durationMs: number, isSlow: boolean = false) {
        this.totalDbQueries++;
        if (isSlow) {
            this.slowDbQueries++;
        }
        this.dbDurations.push(durationMs);
        if (this.dbDurations.length > 2000) {
            this.dbDurations.shift();
        }
    }

    /**
     * Calculates statistical percentiles (p50, p90, p99) from an array of numbers.
     */
    private computeStats(samples: number[]): LatencyStats {
        if (samples.length === 0) {
            return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p90: 0, p99: 0 };
        }

        const sorted = [...samples].sort((a, b) => a - b);
        const count = sorted.length;
        const min = sorted[0]!;
        const max = sorted[count - 1]!;
        const avg = Number((sorted.reduce((a, b) => a + b, 0) / count).toFixed(2));

        const getPercentile = (p: number) => {
            const index = Math.min(Math.floor((p / 100) * count), count - 1);
            return sorted[index]!;
        };

        return {
            count,
            min: Number(min.toFixed(2)),
            max: Number(max.toFixed(2)),
            avg,
            p50: Number(getPercentile(50).toFixed(2)),
            p90: Number(getPercentile(90).toFixed(2)),
            p99: Number(getPercentile(99).toFixed(2)),
        };
    }

    /**
     * Retrieves system and memory metrics.
     */
    getProcessMetrics() {
        const mem = process.memoryUsage();
        const cpu = process.cpuUsage();
        const uptimeSeconds = Number((process.uptime()).toFixed(1));

        return {
            uptimeSeconds,
            memory: {
                rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
                heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
                heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
                externalMb: Number((mem.external / (1024 * 1024)).toFixed(2)),
            },
            cpu: {
                userMs: Number((cpu.user / 1000).toFixed(2)),
                systemMs: Number((cpu.system / 1000).toFixed(2)),
            },
        };
    }

    /**
     * Retrieves complete JSON snapshot of all system metrics.
     */
    getMetricsSnapshot() {
        return {
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            http: {
                totalRequests: this.totalRequests,
                statusCodes: { ...this.statusCodes },
                latencyMs: this.computeStats(this.httpDurations),
                topRoutes: Array.from(this.routeStats.entries())
                    .map(([route, stat]) => ({
                        route,
                        count: stat.count,
                        avgDurationMs: Number((stat.totalDurationMs / stat.count).toFixed(2)),
                    }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10),
            },
            database: {
                totalQueries: this.totalDbQueries,
                slowQueries: this.slowDbQueries,
                latencyMs: this.computeStats(this.dbDurations),
            },
            process: this.getProcessMetrics(),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Generates standard Prometheus exposition format text for Prometheus / Grafana scrapers.
     */
    toPrometheusText(): string {
        const lines: string[] = [];
        const snapshot = this.getMetricsSnapshot();

        lines.push("# HELP http_requests_total Total number of HTTP requests");
        lines.push("# TYPE http_requests_total counter");
        lines.push(`http_requests_total ${snapshot.http.totalRequests}`);

        lines.push("# HELP http_requests_by_status Total HTTP requests partitioned by status class");
        lines.push("# TYPE http_requests_by_status counter");
        for (const [statusClass, count] of Object.entries(snapshot.http.statusCodes)) {
            lines.push(`http_requests_by_status{status_class="${statusClass}"} ${count}`);
        }

        lines.push("# HELP http_response_time_ms HTTP response duration in milliseconds");
        lines.push("# TYPE http_response_time_ms summary");
        lines.push(`http_response_time_ms{quantile="0.5"} ${snapshot.http.latencyMs.p50}`);
        lines.push(`http_response_time_ms{quantile="0.9"} ${snapshot.http.latencyMs.p90}`);
        lines.push(`http_response_time_ms{quantile="0.99"} ${snapshot.http.latencyMs.p99}`);
        lines.push(`http_response_time_ms_count ${snapshot.http.latencyMs.count}`);

        lines.push("# HELP database_queries_total Total database queries executed");
        lines.push("# TYPE database_queries_total counter");
        lines.push(`database_queries_total ${snapshot.database.totalQueries}`);

        lines.push("# HELP database_slow_queries_total Total database queries exceeding threshold");
        lines.push("# TYPE database_slow_queries_total counter");
        lines.push(`database_slow_queries_total ${snapshot.database.slowQueries}`);

        lines.push("# HELP process_memory_rss_bytes Resident Set Size memory in bytes");
        lines.push("# TYPE process_memory_rss_bytes gauge");
        lines.push(`process_memory_rss_bytes ${process.memoryUsage().rss}`);

        lines.push("# HELP process_memory_heap_used_bytes Heap used in bytes");
        lines.push("# TYPE process_memory_heap_used_bytes gauge");
        lines.push(`process_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`);

        lines.push("# HELP process_uptime_seconds Process uptime in seconds");
        lines.push("# TYPE process_uptime_seconds gauge");
        lines.push(`process_uptime_seconds ${snapshot.process.uptimeSeconds}`);

        return lines.join("\n") + "\n";
    }

    /**
     * Resets metrics state (used primarily in test suites).
     */
    reset() {
        this.startTime = Date.now();
        this.totalRequests = 0;
        this.statusCodes = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
        this.routeStats.clear();
        this.httpDurations = [];
        this.totalDbQueries = 0;
        this.slowDbQueries = 0;
        this.dbDurations = [];
    }
}

export const metricsService = new MetricsService();
