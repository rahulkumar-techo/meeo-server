import { z } from "zod";

export const JobFilterCategorySchema = z.enum([
    "ALL",
    "CRITICAL_CHECKOUTS",
    "ORDER_FULFILLMENT_SYNC",
    "MARKETING_EMAIL_BATCH",
    "DEAD_LETTER_TRIGGER",
]);

export const JobStatusSchema = z.enum([
    "WAITING",
    "ACTIVE",
    "COMPLETED",
    "FAILED",
    "DELAYED",
    "DEAD_LETTER",
]);

export const QueryJobsSchema = z.object({
    filter: JobFilterCategorySchema.default("ALL"),
    status: JobStatusSchema.optional(),
    handler: z.string().trim().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const BulkJobActionSchema = z.object({
    action: z.enum([
        "RETRY_ALL_FAILED",
        "PURGE_DEAD_LETTER",
        "PAUSE_QUEUES",
        "RESUME_QUEUES",
    ]),
    queueName: z.string().optional(),
});

export type JobFilterCategory = z.infer<typeof JobFilterCategorySchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type QueryJobsInput = z.infer<typeof QueryJobsSchema>;
export type BulkJobActionInput = z.infer<typeof BulkJobActionSchema>;
