import { z } from "zod";

/**
 * Schema for querying Outbox events with filters and pagination.
 */
export const outboxQuerySchema = z.object({
    status: z.enum(["PENDING", "PROCESSING", "PUBLISHED", "FAILED"]).optional(),
    eventType: z.string().trim().optional(),
    aggregateType: z.string().trim().optional(),
    aggregateId: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Schema for triggering immediate batch publish cycles.
 */
export const outboxPublishBatchSchema = z.object({
    batchSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Schema for querying Processed events audit records.
 */
export const processedEventsQuerySchema = z.object({
    status: z.enum(["PROCESSING", "COMPLETED", "FAILED"]).optional(),
    consumerName: z.string().trim().optional(),
    eventId: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type OutboxQueryInput = z.infer<typeof outboxQuerySchema>;
export type OutboxPublishBatchInput = z.infer<typeof outboxPublishBatchSchema>;
export type ProcessedEventsQueryInput = z.infer<typeof processedEventsQuerySchema>;
