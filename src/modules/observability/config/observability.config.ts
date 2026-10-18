// Configuration for Prometheus and Loki connections, credentials, and metric presets.

import type { MetricPresetDefinition } from "../types/observability.types.js";

export function getPrometheusConfig() {
    const rawUrl = process.env.PROMETHEUS_URL || "http://localhost:9090";
    const user = process.env.PROMETHEUS_USER || process.env.PROMETHEUS_USERNAME;
    const pass = process.env.PROMETHEUS_PASSWORD || process.env.GRAFANA_CLOUD_TOKEN;
    const token = process.env.PROMETHEUS_BEARER_TOKEN;

    const headers: Record<string, string> = {
        Accept: "application/json",
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    } else if (user && pass) {
        const credentials = Buffer.from(`${user}:${pass}`).toString("base64");
        headers.Authorization = `Basic ${credentials}`;
    }

    return {
        baseUrl: rawUrl.replace(/\/+$/, ""),
        headers,
        timeoutMs: 15000,
    };
}

export function getLokiConfig() {
    const rawUrl = process.env.LOKI_URL || "http://localhost:3100";
    const user = process.env.LOKI_USER_ID;
    const token = process.env.GRAFANA_LOKI_TOKEN || process.env.LOKI_PASSWORD;

    // Normalize base URL: if user provided a push endpoint, extract the origin base
    let baseUrl = rawUrl.replace(/\/+$/, "");
    try {
        const parsed = new URL(baseUrl);
        // If path ends with /loki/api/v1/push or /api/prom/push, strip the path
        if (parsed.pathname.includes("/api/")) {
            baseUrl = parsed.origin;
        }
    } catch {
        // Keep baseUrl as is
    }

    const headers: Record<string, string> = {
        Accept: "application/json",
    };

    if (user && token) {
        const credentials = Buffer.from(`${user}:${token}`).toString("base64");
        headers.Authorization = `Basic ${credentials}`;
    } else if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    // Determine WebSocket URL for live tailing
    const wsUrl = baseUrl.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");

    return {
        baseUrl,
        wsUrl,
        user,
        token,
        headers,
        timeoutMs: 15000,
    };
}

// Canonical dashboard metric presets for instant frontend charts
export const OBSERVABILITY_PRESETS: MetricPresetDefinition[] = [
    {
        id: "http_request_rate",
        title: "HTTP Request Rate",
        description: "Requests handled per second across API routes",
        unit: "req/s",
        category: "http",
        query: 'sum(rate(http_requests_total[1m])) or sum(rate(fastify_http_requests_total[1m])) or rate(http_requests_total[1m])',
        defaultStep: "15s",
    },
    {
        id: "http_error_rate",
        title: "5xx Error Percentage",
        description: "Percentage of requests resulting in internal server errors",
        unit: "%",
        category: "http",
        query: '(sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))) * 100 or vector(0)',
        defaultStep: "15s",
    },
    {
        id: "http_latency_p95",
        title: "P95 Request Latency",
        description: "95th percentile HTTP request duration in milliseconds",
        unit: "ms",
        category: "http",
        query: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[1m])) by (le)) * 1000 or (histogram_quantile(0.95, sum(rate(fastify_http_request_duration_seconds_bucket[1m])) by (le)) * 1000)',
        defaultStep: "15s",
    },
    {
        id: "process_cpu_usage",
        title: "Process CPU Usage",
        description: "CPU time consumed by the Node.js API runtime",
        unit: "%",
        category: "system",
        query: 'rate(process_cpu_user_seconds_total[1m]) * 100',
        defaultStep: "15s",
    },
    {
        id: "process_memory_mb",
        title: "Resident Memory (RSS)",
        description: "Total physical memory allocated by the API process",
        unit: "MB",
        category: "system",
        query: 'process_resident_memory_bytes / 1024 / 1024',
        defaultStep: "30s",
    },
    {
        id: "http_client_error_rate",
        title: "Client Error Percentage (4xx)",
        description: "Percentage of client validation and route failures (400, 404, 405, 413, 415, 422)",
        unit: "%",
        category: "http",
        query: '(sum(rate(http_requests_total{status=~"400|404|405|413|415|422"}[1m])) / sum(rate(http_requests_total[1m]))) * 100 or vector(0)',
        defaultStep: "15s",
    },
    {
        id: "http_security_events",
        title: "Security & Policy Events",
        description: "Throughput of unauthorized (401), forbidden (403), and rate-limited (429) requests",
        unit: "req/s",
        category: "http",
        query: 'sum(rate(http_requests_total{status=~"401|403|429"}[1m])) or vector(0)',
        defaultStep: "15s",
    },
    {
        id: "business_failure_rate",
        title: "Business Failure Rate",
        description: "Application-level domain failures (payment, order creation, background jobs)",
        unit: "%",
        category: "business",
        query: '(sum(rate(business_operations_total{status="failure"}[1m])) / sum(rate(business_operations_total[1m]))) * 100 or vector(0)',
        defaultStep: "15s",
    },
    {
        id: "node_event_loop_lag",
        title: "Event Loop Lag",
        description: "Node.js main thread responsiveness and scheduling delay",
        unit: "ms",
        category: "system",
        query: 'nodejs_eventloop_lag_p95_seconds * 1000 or nodejs_eventloop_lag_seconds * 1000',
        defaultStep: "15s",
    },
];
