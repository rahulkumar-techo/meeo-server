import type { FastifyRequest, FastifyReply } from "fastify";
import { outboxService } from "../services/outbox.service.js";
import {
    outboxQuerySchema,
    outboxPublishBatchSchema,
    processedEventsQuerySchema,
} from "../validations/outbox.validation.js";

export class OutboxController {
    /**
     * Lists Outbox events with filters and pagination.
     */
    async listOutboxEvents(req: FastifyRequest, reply: FastifyReply) {
        const query = outboxQuerySchema.parse(req.query);
        const result = await outboxService.listOutboxEvents(query);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Retrieves an Outbox event by ID.
     */
    async getOutboxEventById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await outboxService.getOutboxEventById(id);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Triggers immediate batch publishing of pending outbox events.
     */
    async publishBatch(req: FastifyRequest, reply: FastifyReply) {
        const body = outboxPublishBatchSchema.parse(req.body || {});
        const result = await outboxService.pollAndPublishBatch(body.batchSize);
        return reply.status(200).send({
            status: "success",
            message: "Batch publish cycle completed",
            data: result,
        });
    }

    /**
     * Manually retries a failed outbox event.
     */
    async retryEvent(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await outboxService.retryFailedEvent(id);
        return reply.status(200).send({
            status: "success",
            message: "Outbox event queued for retry",
            data: result,
        });
    }

    /**
     * Retrieves outbox system and queue metrics.
     */
    async getMetrics(_req: FastifyRequest, reply: FastifyReply) {
        const result = await outboxService.getOutboxMetrics();
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Lists processed events audit log.
     */
    async listProcessedEvents(req: FastifyRequest, reply: FastifyReply) {
        const query = processedEventsQuerySchema.parse(req.query);
        const result = await outboxService.listProcessedEvents(query as any);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }
}

export const outboxController = new OutboxController();
