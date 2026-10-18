// Fastify routes for the Observability Platform (/api/v1/observability).

import type { FastifyInstance } from "fastify";
import { observabilityController } from "../controllers/observability.controller.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

export async function observabilityRouter(app: FastifyInstance) {
    // Require authentication and admin privileges
    app.addHook("preHandler", app.authenticate);

    const observabilityAuth = [
        app.requireAnyPermission([PERMISSIONS.SYSTEM_MANAGE, PERMISSIONS.DASHBOARD_READ]),
    ];

    // --- Metrics Endpoints (Prometheus) ---

    app.get(
        "/metrics/range",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Query Prometheus range metrics for time-series charts",
                description:
                    "Executes a Prometheus range query and returns normalized, chart-ready time series data with statistics (min, max, avg, latest).",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Custom PromQL expression" },
                        preset: {
                            type: "string",
                            description: "Predefined preset ID (e.g. http_request_rate, process_cpu_usage)",
                        },
                        start: { type: "string", description: "Start time (ISO-8601 or epoch seconds)" },
                        end: { type: "string", description: "End time (ISO-8601 or epoch seconds)" },
                        step: { type: "string", description: "Step resolution (e.g. 15s, 1m, 5m)" },
                    },
                },
            },
        },
        observabilityController.getMetricsRange.bind(observabilityController),
    );

    app.get(
        "/metrics/query",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Query Prometheus instant metric snapshot",
                description: "Evaluates an instant PromQL query at a single point in time.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Custom PromQL expression" },
                        preset: { type: "string", description: "Preset ID" },
                        time: { type: "string", description: "Evaluation time (ISO-8601 or epoch)" },
                    },
                },
            },
        },
        observabilityController.getMetricsInstant.bind(observabilityController),
    );

    app.get(
        "/metrics/presets",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Get available dashboard metric presets",
                description: "Lists all pre-configured dashboard PromQL queries with recommended units and step resolutions.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getPresets.bind(observabilityController),
    );

    // --- Logs Endpoints (Loki) ---

    app.get(
        "/logs/query",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Query historical logs from Loki",
                description:
                    "Queries Loki using LogQL over a specified time window, returning structured normalized log entries.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            default: '{job="docker"}',
                            description: "LogQL query stream selector",
                        },
                        start: { type: "string", description: "Start time (ISO-8601 or epoch nanoseconds/ms)" },
                        end: { type: "string", description: "End time (ISO-8601 or epoch nanoseconds/ms)" },
                        limit: { type: "integer", default: 100, description: "Maximum entries to retrieve (1-500)" },
                        direction: { type: "string", enum: ["backward", "forward"], default: "backward" },
                        level: {
                            type: "string",
                            enum: ["error", "warn", "info", "debug", "trace"],
                            description: "Filter by log level",
                        },
                    },
                },
            },
        },
        observabilityController.getLogs.bind(observabilityController),
    );

    app.get(
        "/logs/labels",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] List Loki log stream label names",
                description: "Retrieves all indexed label dimensions in Loki (e.g. container, job, service).",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getLogLabels.bind(observabilityController),
    );

    app.get(
        "/logs/labels/:name/values",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] List values for a specific Loki label",
                description: "Retrieves all distinct values for a given label name (e.g. container names).",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["name"],
                    properties: {
                        name: { type: "string", description: "Label name" },
                    },
                },
            },
        },
        observabilityController.getLogLabelValues.bind(observabilityController),
    );

    app.get(
        "/logs/stream",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Stream live logs in real-time via Server-Sent Events (SSE)",
                description:
                    "Establishes a persistent SSE connection bridging to Loki's /loki/api/v1/tail WebSocket, delivering normalized live log records directly to the browser.",
                security: [{ bearerAuth: [] }],
                querystring: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            default: '{job="docker"}',
                            description: "LogQL query stream selector for live tailing",
                        },
                        limit: { type: "integer", default: 50, description: "Initial log limit" },
                    },
                },
            },
        },
        observabilityController.streamLiveLogs.bind(observabilityController),
    );

    // --- Background Queues & BullMQ Telemetry ---

    app.get(
        "/queues",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] BullMQ background job queues overview and telemetry",
                description:
                    "Aggregates job counts, worker health, active concurrency, failure rates, and DLQ depth across all BullMQ queues.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getQueues.bind(observabilityController),
    );

    app.get(
        "/queues/jobs",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] BullMQ jobs query by queue and status",
                description: "Retrieves paginated job records for inspection, failure diagnosis, or retry.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getQueueJobs.bind(observabilityController),
    );

    // --- Service Topology (React Flow) & Tracing (OpenTelemetry) ---

    app.get(
        "/topology",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Service topology nodes and edges for React Flow",
                description: "Returns live microservice nodes and edge data with latencies, throughput, and health status.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getTopology.bind(observabilityController),
    );

    app.get(
        "/traces",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] OpenTelemetry distributed request traces with waterfall spans",
                description: "Retrieves recent HTTP request traces with child spans, execution latencies, and error context.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getTraces.bind(observabilityController),
    );

    // --- Dynamic Alert Thresholds & Observability Configurations ---

    app.get(
        "/configs",
        {
            preHandler: observabilityAuth,
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Retrieve all dynamic observability configs and thresholds",
                description: "Returns threshold configurations for server errors (5xx), client errors (4xx), security spikes, and business operations served from L1/L2 cache.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.getConfigs.bind(observabilityController),
    );

    app.put(
        "/configs/:key",
        {
            preHandler: [app.requireAnyPermission([PERMISSIONS.SYSTEM_MANAGE])],
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Update an observability config or alert threshold",
                description: "Updates threshold rules in database and invalidates L1/L2 caches across all instances.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["key"],
                    properties: {
                        key: { type: "string", description: "Config key (e.g. thresholds:server_5xx)" },
                    },
                },
                body: {
                    type: "object",
                    properties: {
                        isEnabled: { type: "boolean" },
                        description: { type: "string" },
                        value: { type: "object" },
                    },
                },
            },
        },
        observabilityController.updateConfig.bind(observabilityController),
    );

    app.post(
        "/configs/reset",
        {
            preHandler: [app.requireAnyPermission([PERMISSIONS.SYSTEM_MANAGE])],
            schema: {
                tags: ["System - Observability"],
                summary: "[Admin] Reset all observability thresholds to default baseline",
                description: "Resets all thresholds to the recommended production baselines.",
                security: [{ bearerAuth: [] }],
            },
        },
        observabilityController.resetConfigs.bind(observabilityController),
    );
}
