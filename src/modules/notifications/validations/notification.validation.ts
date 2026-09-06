import { z } from "zod";

/**
 * Schema for querying in-app and delivery notifications.
 */
export const notificationQuerySchema = z.object({
    unreadOnly: z
        .preprocess((val) => {
            if (typeof val === "string") return val.toLowerCase() === "true";
            if (typeof val === "boolean") return val;
            return undefined;
        }, z.boolean().optional()),
    type: z.string().trim().optional(),
    channel: z.enum(["EMAIL", "PUSH", "IN_APP"]).optional(),
    status: z.enum(["PENDING", "SENT", "FAILED", "READ"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Schema for updating user notification preferences.
 */
export const updateNotificationPreferencesSchema = z.object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    orderUpdates: z.boolean().optional(),
    promotions: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    lowStockAlerts: z.boolean().optional(),
});

/**
 * Schema for admin manual or broadcast notification dispatch.
 */
export const sendNotificationSchema = z.object({
    userId: z.string().uuid().optional(),
    recipientEmail: z.string().email().optional(),
    type: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    channels: z.array(z.enum(["EMAIL", "PUSH", "IN_APP"])).min(1),
    data: z.record(z.string(), z.any()).optional(),
});

export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
