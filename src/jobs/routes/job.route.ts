import type { FastifyInstance } from "fastify";
import { jobController } from "../controller/job.controller.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Background Jobs & Worker Telemetry routes under /api/v1/jobs.
 */
export default async function jobRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Overview & Telemetry Metrics
    // ----------------------------------------------------
    app.get(
        "/overview",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Background jobs overview & throughput KPIs",
                description: "Live summary of active jobs in flight, throttled jobs, throughput, average execution latency (p50/p95), and dead-letter queue depth.",
                security: [{ bearerAuth: [] }],
            },
        },
        jobController.getOverview.bind(jobController),
    );

    app.get(
        "/workers",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Worker nodes health and utilization",
                description: "Telemetry on worker pods, CPU and memory utilization %, active concurrency, uptime, and node health.",
                security: [{ bearerAuth: [] }],
            },
        },
        jobController.getWorkerNodes.bind(jobController),
    );

    // ----------------------------------------------------
    // Jobs Table & Query
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] List background jobs for table view",
                description: "Queries background jobs with queue category filters (All, Critical Checkouts, Order Fulfillment Sync, Marketing Email Batch, Dead Letter Trigger), status, search, and pagination.",
                security: [{ bearerAuth: [] }],
            },
        },
        jobController.listJobs.bind(jobController),
    );

    app.get(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Get job details and execution trace",
                description: "Retrieves complete job JSON payload, error trace, and consumer execution logs.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        jobController.getJobDetails.bind(jobController),
    );

    // ----------------------------------------------------
    // Job Lifecycle Actions & Bulk Operations
    // ----------------------------------------------------
    app.post(
        "/:id/retry",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Retry failed or dead-lettered job",
                description: "Resets attempt counter and immediately dispatches job for execution.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        jobController.retryJob.bind(jobController),
    );

    app.post(
        "/:id/cancel",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Cancel active or waiting job",
                description: "Cancels and marks job as discarded.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        jobController.cancelJob.bind(jobController),
    );

    app.post(
        "/bulk-action",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Background Jobs & Workers"],
                summary: "[Admin: system:manage] Execute bulk queue actions",
                description: "Performs bulk operations such as RETRY_ALL_FAILED, PURGE_DEAD_LETTER, PAUSE_QUEUES, RESUME_QUEUES.",
                security: [{ bearerAuth: [] }],
            },
        },
        jobController.executeBulkAction.bind(jobController),
    );
}
