import type { FastifyInstance } from "fastify";
import { outboxController } from "../controller/outbox.controller.js";
import { outboxSwaggerSchemas } from "@/common/docs/outboxDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Transactional Outbox & Event Management routes under /api/outbox.
 */
export default async function outboxRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Outbox Events Inspection & Query
    // ----------------------------------------------------
    app.get(
        "/events",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] List outbox events",
                description: "Query outbox events with status filter, retry state, payload, and pagination.",
                security: [{ bearerAuth: [] }],
                querystring: outboxSwaggerSchemas.outboxQuery,
            },
        },
        outboxController.listOutboxEvents.bind(outboxController),
    );

    app.get(
        "/events/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] Get outbox event by ID",
                description: "Retrieve a specific outbox event details, payload, lock state, and last error.",
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
        outboxController.getOutboxEventById.bind(outboxController),
    );

    // ----------------------------------------------------
    // Batch Publishing & Manual Retry Trigger
    // ----------------------------------------------------
    app.post(
        "/publish-now",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] Trigger batch publish cycle",
                description: "Polls pending outbox records, acquires publisher lock, and enqueues them into BullMQ domain-events queue.",
                security: [{ bearerAuth: [] }],
                body: outboxSwaggerSchemas.publishBatch,
            },
        },
        outboxController.publishBatch.bind(outboxController),
    );

    app.post(
        "/events/:id/retry",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] Manually retry a failed outbox event",
                description: "Resets attempt counter and status back to PENDING for re-publishing.",
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
        outboxController.retryEvent.bind(outboxController),
    );

    // ----------------------------------------------------
    // Operational Metrics & Consumer Auditing
    // ----------------------------------------------------
    app.get(
        "/metrics",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] Outbox and BullMQ Queue Metrics",
                description: "Live breakdown of outbox states (pending, processing, published, failed) and BullMQ waiting/active/completed/failed queue job counts.",
                security: [{ bearerAuth: [] }],
            },
        },
        outboxController.getMetrics.bind(outboxController),
    );

    app.get(
        "/processed",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Transactional Outbox & Events"],
                summary: "[Admin: system:manage] List processed events audit trail",
                description: "Audit records of events processed by individual domain consumers with idempotency tracking.",
                security: [{ bearerAuth: [] }],
                querystring: outboxSwaggerSchemas.processedEventsQuery,
            },
        },
        outboxController.listProcessedEvents.bind(outboxController),
    );
}
