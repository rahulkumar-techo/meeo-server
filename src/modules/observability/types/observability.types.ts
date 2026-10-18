// Common response schemas and normalized domain types for the observability platform.

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace" | "unknown";

// Normalized single log entry
export interface NormalizedLogEntry {
    id: string;
    timestamp: string; // ISO-8601 string (e.g. 2026-10-18T00:54:00.000Z)
    timestampNs: string; // Original nanosecond timestamp from Loki
    level: LogLevel;
    message: string;
    labels: Record<string, string>;
    structured?: Record<string, unknown> | undefined; // Parsed JSON body if structured logger (e.g. Pino) was used
    raw: string; // Unaltered raw log line
}

// Normalized time-series metric data point
export interface NormalizedMetricPoint {
    timestamp: number; // Milliseconds epoch timestamp for charts
    timeIso: string; // ISO-8601 representation
    value: number; // Parsed numeric value (e.g. 42.5)
}

// Normalized single metric series (line or bar in a chart)
export interface NormalizedMetricSeries {
    id: string; // Unique deterministic identifier
    name: string; // Human-friendly display label (e.g. GET /api/v1/catalog)
    metricName: string; // Base Prometheus metric name (__name__)
    labels: Record<string, string>; // Metric label dimensions
    points: NormalizedMetricPoint[]; // Time-series data points
    summary: {
        min: number;
        max: number;
        avg: number;
        latest: number;
        count: number;
    };
}

// Normalized instant metric result
export interface NormalizedInstantMetric {
    id: string;
    name: string;
    metricName: string;
    labels: Record<string, string>;
    timestamp: number;
    timeIso: string;
    value: number;
}

// Standard API response envelopes exposed to frontend
export interface MetricsRangeResponse {
    success: boolean;
    query: string;
    start: string;
    end: string;
    step: string;
    seriesCount: number;
    series: NormalizedMetricSeries[];
}

export interface MetricsInstantResponse {
    success: boolean;
    query: string;
    time: string;
    count: number;
    results: NormalizedInstantMetric[];
}

export interface LogsQueryResponse {
    success: boolean;
    query: string;
    total: number;
    direction: "backward" | "forward";
    logs: NormalizedLogEntry[];
    streamsCount: number;
}

export interface MetricPresetDefinition {
    id: string;
    title: string;
    description: string;
    unit: string;
    category: "system" | "http" | "database" | "business";
    query: string;
    defaultStep: string;
}

// Raw Prometheus API Response shapes (Internal)
export interface PrometheusMetricResult<TValue> {
    metric: Record<string, string>;
    values?: TValue; // For matrix: [number, string][]
    value?: TValue; // For vector: [number, string]
}

export interface PrometheusRawData<TResult> {
    resultType: "matrix" | "vector" | "scalar" | "string";
    result: TResult[];
}

export interface PrometheusRawResponse<TResult> {
    status: "success" | "error";
    errorType?: string;
    error?: string;
    data: PrometheusRawData<TResult>;
}

// Raw Loki API Response shapes (Internal)
export interface LokiRawStream {
    stream: Record<string, string>;
    values: [string, string][]; // [nanosecond_timestamp, log_line]
}

export interface LokiRawData {
    resultType: "streams" | "matrix" | "vector";
    result: LokiRawStream[];
}

export interface LokiRawResponse {
    status: "success" | "error";
    errorType?: string;
    error?: string;
    data: LokiRawData;
}

// Live tailing payload sent to frontend via SSE / WebSocket
export interface LiveLogEvent {
    type: "connected" | "log" | "error" | "heartbeat";
    timestamp: string;
    data?: NormalizedLogEntry;
    error?: string;
}

// Logical categories for observability thresholds and alert rules
export type ObservabilityCategory = "server_errors" | "client_errors" | "security" | "business";

// Config payload representing threshold percentages and evaluation parameters
export interface ObservabilityThresholdConfig {
    warningRatePercent?: number;
    criticalRatePercent?: number;
    evaluationWindowMinutes?: number;
    minimumRequestsPerMinute?: number;
    max5xxVolumePerMinute?: number;
    monitoredStatusCodes?: number[];
    excludeStatusCodes?: number[];
    spikeThresholdRequestsPerMin?: number;
    rateLimit429ThresholdPerMin?: number;
    paymentFailureRatePercent?: number;
    orderFailureRatePercent?: number;
    backgroundJobDlqThreshold?: number;
    [key: string]: unknown;
}

// Normalized configuration record returned to admin dashboard
export interface ObservabilityConfigItem {
    id: string;
    key: string;
    category: ObservabilityCategory | string;
    value: ObservabilityThresholdConfig;
    description: string | null;
    isEnabled: boolean;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

