/**
 * Swagger documentation schemas and tags for Notification system endpoints.
 */
export const notificationTags = [
    {
        name: "Notifications & Preferences",
        description: "🔔 In-App Notifications, Multi-Channel Delivery (Email, Push, In-App), Templates, User Preferences, and Async Outbox Event Consumers",
    },
];

export const notificationSwaggerSchemas = {
    notificationQuery: {
        type: "object",
        properties: {
            unreadOnly: { type: "boolean", description: "Filter only unread notifications" },
            type: { type: "string", description: "Filter by notification event type (e.g. ORDER_CONFIRMED)" },
            channel: { type: "string", enum: ["EMAIL", "PUSH", "IN_APP"], description: "Filter by delivery channel" },
            status: { type: "string", enum: ["PENDING", "SENT", "FAILED", "READ"], description: "Filter by delivery status" },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    updatePreferences: {
        type: "object",
        properties: {
            emailEnabled: { type: "boolean", description: "Enable/disable email channel" },
            pushEnabled: { type: "boolean", description: "Enable/disable push notification channel" },
            inAppEnabled: { type: "boolean", description: "Enable/disable in-app bell notification channel" },
            orderUpdates: { type: "boolean", description: "Opt-in for order lifecycle events" },
            promotions: { type: "boolean", description: "Opt-in for marketing promotions" },
            securityAlerts: { type: "boolean", description: "Opt-in for security & login alerts" },
            lowStockAlerts: { type: "boolean", description: "Opt-in for admin low stock alerts" },
        },
    },

    sendNotification: {
        type: "object",
        required: ["type", "title", "body", "channels"],
        properties: {
            userId: { type: "string", format: "uuid", description: "Target user ID (for in-app/push)" },
            recipientEmail: { type: "string", format: "email", description: "Target email address (for email)" },
            type: { type: "string", description: "Notification template or event type" },
            title: { type: "string", description: "Notification subject / title" },
            body: { type: "string", description: "Notification body content" },
            channels: {
                type: "array",
                items: { type: "string", enum: ["EMAIL", "PUSH", "IN_APP"] },
                description: "Selected delivery channels",
            },
            data: { type: "object", additionalProperties: true, description: "Dynamic metadata payload" },
        },
    },
};
