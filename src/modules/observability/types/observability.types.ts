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
export type ObservabilityCategory = "server_errors" | "client_errors" | "security" | "business" | "preferences";

// Server-enforced dashboard window and auto-refresh intervals
export type AllowedTimeWindow = "15m" | "1h" | "6h" | "24h";
export type AllowedAutoRefreshInterval = "5s" | "15s" | "30s" | "Off";

export interface ObservabilityPollingPolicy {
    allowedWindows: AllowedTimeWindow[];
    activeWindow: AllowedTimeWindow;
    allowedIntervals: AllowedAutoRefreshInterval[];
    activeInterval: AllowedAutoRefreshInterval;
    minIntervalSeconds: number;
    allowedAlertCooldownMinutes: number[];
    alertCooldownMinutes: number;
    cacheTier: string;
    updatedAt: string;
}

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
    allowedWindows?: AllowedTimeWindow[];
    activeWindow?: AllowedTimeWindow;
    allowedIntervals?: AllowedAutoRefreshInterval[];
    activeInterval?: AllowedAutoRefreshInterval;
    minIntervalSeconds?: number;
    allowedAlertCooldownMinutes?: number[];
    alertCooldownMinutes?: number;
    cooldownMinutes?: number;
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

// System Hardware, Memory, CPU, Process & Threads information
export interface SystemInfoMemory {
    system: {
        totalBytes: number;
        totalMb: number;
        totalGb: number;
        freeBytes: number;
        freeMb: number;
        freeGb: number;
        usedBytes: number;
        usedMb: number;
        usedGb: number;
        usagePercent: number;
    };
    process: {
        rssBytes: number;
        rssMb: number;
        heapTotalBytes: number;
        heapTotalMb: number;
        heapUsedBytes: number;
        heapUsedMb: number;
        externalBytes: number;
        externalMb: number;
        arrayBuffersBytes: number;
        arrayBuffersMb: number;
        heapLimitBytes: number;
        heapLimitMb: number;
    };
    outOfGiven: {
        processRssPercentOfSystem: number;
        heapUsedPercentOfHeapLimit: number;
        heapUsedPercentOfAllocatedHeap: number;
        systemMemoryUsagePercent: number;
    };
}

export interface SystemInfoCpu {
    model: string;
    cores: number;
    speedMHz: number;
    loadAverage: {
        load1m: number;
        load5m: number;
        load15m: number;
        normalizedLoad1mPercent: number;
    };
    processUsage: {
        userMicroseconds: number;
        systemMicroseconds: number;
        totalCpuSeconds: number;
        processCpuPercentSingleCore: number;
        processCpuPercentTotalSystem: number;
    };
    outOfGiven: {
        processCpuPercentOfTotalCores: number;
        coresGiven: number;
    };
}

export interface SystemInfoProcess {
    pid: number;
    ppid: number;
    title: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    environment: string;
}

export interface SystemInfoThreads {
    hardwareCores: number;
    uvThreadPoolSize: number;
    activeHandlesCount: number;
    activeRequestsCount: number;
    outOfGiven: {
        activeHandles: number;
        activeRequests: number;
        uvThreadPoolGiven: number;
        hardwareCoresGiven: number;
    };
}

export interface SystemInfoDisk {
    totalBytes: number;
    totalGb: number;
    freeBytes: number;
    freeGb: number;
    usedBytes: number;
    usedGb: number;
    usagePercent: number;
    availablePercent: number;
    status: "healthy" | "warning" | "critical";
}

export interface SystemInfoNetworkInterface {
    name: string;
    address: string;
    family: string;
    internal: boolean;
    mac: string;
}

export interface SystemInfoNetwork {
    interfaces: SystemInfoNetworkInterface[];
    activeSocketHandlesCount: number;
    activeRequestsCount: number;
}

export interface SystemInfoProcessesDetails {
    pid: number;
    ppid: number;
    title: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    uptimeFormatted: string;
    eventLoopLagMs: {
        min: number;
        max: number;
        mean: number;
        p50: number;
        p99: number;
    };
    activeHandlesCount: number;
    activeRequestsCount: number;
    uvThreadPoolSize: number;
}

export interface SystemInfoSummary {
    ram: {
        systemMemoryUsed: string;
        processRssOfSystem: string;
        v8HeapUsedOfLimit: string;
    };
    cpu: {
        coresGiven: number;
        model: string;
        processCpuOfTotalCores: string;
    };
    threads: {
        activeHandles: number;
        activeRequests: number;
        uvThreadPoolGiven: number;
        hardwareCoresGiven: number;
    };
    process: {
        pid: number;
        uptime: string;
        nodeVersion: string;
        environment: string;
    };
    disk?: {
        used: string;
        availablePercent: string;
        status: string;
    };
}

export interface SystemInfoResponse {
    summary: SystemInfoSummary;
    ram: SystemInfoMemory;
    cpu: SystemInfoCpu;
    process: SystemInfoProcess;
    threads: SystemInfoThreads;
    disk: SystemInfoDisk;
    network: SystemInfoNetwork;
    timestamp: string;
}

