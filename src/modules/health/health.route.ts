import type { FastifyInstance } from "fastify";
import { healthController } from "./health.controller.js";

/**
 * Registers Observability, Health, Readiness, and Metrics routes.
 */
export default async function healthRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Liveness & Readiness Probes
    // ----------------------------------------------------
    app.get("/live", {
        schema: {
            tags: ["System - Observability"],
            summary: "Liveness probe for orchestrators and container health",
            response: {
                200: {
                    type: "object",
                    properties: {
                        success: { type: "boolean" },
                        data: {
                            type: "object",
                            properties: {
                                status: { type: "string" },
                                uptimeSeconds: { type: "number" },
                                timestamp: { type: "string" },
                                pid: { type: "number" },
                            },
                        },
                    },
                },
            },
        },
    }, healthController.live);

    app.get("/ready", {
        schema: {
            tags: ["System - Observability"],
            summary: "Deep readiness probe checking PostgreSQL, Redis, and Mail services",
        },
    }, healthController.ready);

    // ----------------------------------------------------
    // Workers & Queues Operational Probes
    // ----------------------------------------------------
    app.get("/workers", {
        schema: {
            tags: ["System - Observability"],
            summary: "Inspect active background event workers and poller heartbeats",
        },
    }, healthController.workers);

    app.get("/queues", {
        schema: {
            tags: ["System - Observability"],
            summary: "Inspect BullMQ domain event and dead letter queue metrics",
        },
    }, healthController.queues);

    // ----------------------------------------------------
    // Diagnostics & Errors
    // ----------------------------------------------------
    app.get("/errors", {
        schema: {
            tags: ["System - Observability"],
            summary: "Inspect recent error reports captured by ErrorTracker",
        },
    }, healthController.recentErrors);
}

/**
 * Registers Prometheus and JSON Metrics endpoint under /metrics.
 */
export async function metricsRouter(app: FastifyInstance) {
    app.get("/", {
        schema: {
            tags: ["System - Observability"],
            summary: "Prometheus formatted metrics scrape endpoint",
        },
    }, healthController.metricsPrometheus);

    app.get("/json", {
        schema: {
            tags: ["System - Observability"],
            summary: "JSON snapshot of system, HTTP latency, and database query metrics",
        },
    }, healthController.metricsJson);
}
