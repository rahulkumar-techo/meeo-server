import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { outboxPublisherService, type PublishBatchResult } from "./outboxPublisher.service.js";
import { outboxRetryService } from "./outboxRetry.service.js";
import { processedEventService } from "./processedEvent.service.js";
import { getQueueMetrics } from "@/lib/queue.js";
import type { OutboxQueryInput, ProcessedEventsQueryInput } from "../validations/outbox.validation.js";

export class OutboxService {
    /**
     * Lists outbox events with filtering and pagination.
     */
    async listOutboxEvents(query: OutboxQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.status) where.status = query.status;
        if (query.eventType) where.eventType = query.eventType;
        if (query.aggregateType) where.aggregateType = query.aggregateType;
        if (query.aggregateId) where.aggregateId = query.aggregateId;

        const [items, total] = await Promise.all([
            prisma.outboxEvent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.outboxEvent.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Retrieves an outbox event by ID.
     */
    async getOutboxEventById(id: string) {
        const event = await prisma.outboxEvent.findUnique({
            where: { id },
        });

        if (!event) {
            throw new AppError("Outbox event not found", 404);
        }

        return event;
    }

    /**
     * Triggers a batch poll and publish cycle immediately.
     */
    async pollAndPublishBatch(batchSize?: number): Promise<PublishBatchResult> {
        return outboxPublisherService.pollAndPublishBatch(batchSize);
    }

    /**
     * Manually retries a failed outbox event.
     */
    async retryFailedEvent(id: string) {
        return outboxPublisherService.retryFailedEvent(id);
    }

    /**
     * Retrieves comprehensive operational metrics for Outbox and BullMQ Queues.
     */
    async getOutboxMetrics() {
        const [pending, processing, published, failed, queueMetrics] = await Promise.all([
            prisma.outboxEvent.count({ where: { status: "PENDING" } }),
            prisma.outboxEvent.count({ where: { status: "PROCESSING" } }),
            prisma.outboxEvent.count({ where: { status: "PUBLISHED" } }),
            prisma.outboxEvent.count({ where: { status: "FAILED" } }),
            getQueueMetrics().catch(() => ({ domainEvents: {}, deadLetter: {}, timestamp: new Date().toISOString() })),
        ]);

        return {
            outbox: {
                pending,
                processing,
                published,
                failed,
                total: pending + processing + published + failed,
            },
            queues: queueMetrics,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Lists processed event audit records.
     */
    async listProcessedEvents(query: ProcessedEventsQueryInput) {
        return processedEventService.listProcessedEvents(query);
    }
}

export const outboxService = new OutboxService();
