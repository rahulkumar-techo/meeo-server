import { z } from "zod";
import { UserEventType } from "@/generated/prisma/enums.js";

// Validation for single user event payload
export const singleEventSchema = z.object({
    clientEventId: z.string().trim().max(128).optional(),
    sessionId: z.string().trim().max(128).optional(),
    event: z.nativeEnum(UserEventType, {
        message: "Invalid user event type",
    }),
    entityType: z.string().trim().max(64).optional(),
    entityId: z.string().trim().max(128).optional(),
    metadata: z.record(z.string(), z.any()).optional().refine((data) => {
        if (!data) return true;
        // Guard against oversized metadata (max 4KB per event)
        return JSON.stringify(data).length <= 4096;
    }, { message: "Metadata exceeds maximum allowed size (4KB)" }),
    createdAt: z.string().datetime().optional(),
});

// POST /tracking/events body
export const batchEventsBody = z.object({
    events: z.array(singleEventSchema).min(1).max(100),
});

// POST /tracking/identify body
export const identifyBody = z.object({
    sessionId: z.string().trim().min(1).max(128),
    events: z.array(singleEventSchema).max(100).optional(),
});

// User 360 params
export const user360Params = z.object({
    userId: z.string().uuid("Invalid user ID format"),
});

// User 360 query
export const user360Query = z.object({
    include: z.string().trim().optional(),
});

// User Activity query
export const userActivityQuery = z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SingleEventInput = z.infer<typeof singleEventSchema>;
export type BatchEventsInput = z.infer<typeof batchEventsBody>;
export type IdentifyInput = z.infer<typeof identifyBody>;
export type User360Params = z.infer<typeof user360Params>;
export type User360Query = z.infer<typeof user360Query>;
export type UserActivityQuery = z.infer<typeof userActivityQuery>;
