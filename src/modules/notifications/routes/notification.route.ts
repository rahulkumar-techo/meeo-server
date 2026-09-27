import type { FastifyInstance } from "fastify";
import { notificationController } from "../controller/notification.controller.js";
import { notificationSwaggerSchemas } from "@/common/docs/notificationDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Notification and Preferences routes under /api/notifications.
 */
export default async function notificationRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // User In-App Notifications
    // ----------------------------------------------------


    

    app.get(
        "/",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] List my notifications",
                description: "Retrieves the authenticated user's notification feed with unread filter, channel filter, and pagination.",
                security: [{ bearerAuth: [] }],
                querystring: notificationSwaggerSchemas.notificationQuery,
            },
        },
        notificationController.listMyNotifications.bind(notificationController),
    );

    app.get(
        "/unread-count",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Get unread notification count",
                description: "Returns the count of unread in-app notifications for bell icon badge displays.",
                security: [{ bearerAuth: [] }],
            },
        },
        notificationController.getUnreadCount.bind(notificationController),
    );

    app.patch(
        "/:id/read",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Mark notification as read",
                description: "Marks a specific notification as read by setting readAt timestamp.",
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
        notificationController.markAsRead.bind(notificationController),
    );

    app.post(
        "/mark-all-read",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Mark all notifications as read",
                description: "Marks all unread notifications for the authenticated user as read in a single batch.",
                security: [{ bearerAuth: [] }],
            },
        },
        notificationController.markAllAsRead.bind(notificationController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Delete notification",
                description: "Dismisses and permanently deletes an in-app notification record.",
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
        notificationController.deleteNotification.bind(notificationController),
    );

    // ----------------------------------------------------
    // User Device Push Tokens (FCM)
    // ----------------------------------------------------
    app.post(
        "/devices",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Register or update device push token",
                description: "Registers an FCM device token for mobile (iOS/Android) or web browser push notifications.",
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["token"],
                    properties: {
                        token: { type: "string", minLength: 10 },
                        platform: { type: "string", enum: ["web", "android", "ios"], default: "web" },
                        userAgent: { type: "string" },
                    },
                },
            },
        },
        notificationController.registerDeviceToken.bind(notificationController),
    );

    app.delete(
        "/devices",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Unregister device push token",
                description: "Deactivates an FCM device push token (e.g. on user logout).",
                security: [{ bearerAuth: [] }],
                body: {
                    type: "object",
                    required: ["token"],
                    properties: {
                        token: { type: "string", minLength: 10 },
                    },
                },
            },
        },
        notificationController.unregisterDeviceToken.bind(notificationController),
    );

    app.get(
        "/devices",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] List my registered devices",
                description: "Lists all active registered device tokens and platforms for the authenticated user.",
                security: [{ bearerAuth: [] }],
            },
        },
        notificationController.listMyDeviceTokens.bind(notificationController),
    );

    // ----------------------------------------------------
    // User Notification Preferences
    // ----------------------------------------------------
    app.get(
        "/preferences",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Get my notification preferences",
                description: "Retrieves channel settings (email, push, in-app) and category subscriptions (orders, promotions, security).",
                security: [{ bearerAuth: [] }],
            },
        },
        notificationController.getPreferences.bind(notificationController),
    );

    app.put(
        "/preferences",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Authenticated User] Update my notification preferences",
                description: "Updates opt-in/opt-out channel and event preferences for the authenticated user.",
                security: [{ bearerAuth: [] }],
                body: notificationSwaggerSchemas.updatePreferences,
            },
        },
        notificationController.updatePreferences.bind(notificationController),
    );

    // ----------------------------------------------------
    // Admin Notification Management & Analytics
    // ----------------------------------------------------
    app.get(
        "/admin/overview",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Admin: system:manage] Notification dashboard overview and KPIs",
                description: "Retrieves platform-wide notification stats, breakdown by channel (Email, Push, In-App), delivery success rates, and registered device counts.",
                security: [{ bearerAuth: [] }],
            },
        },
        notificationController.getAdminOverview.bind(notificationController),
    );

    app.get(
        "/admin",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Admin: system:manage] List all platform notifications with filters",
                description: "Administrative query across all user notifications with channel, status, event type, date range, and search filters.",
                security: [{ bearerAuth: [] }],
                querystring: notificationSwaggerSchemas.adminNotificationFilter,
            },
        },
        notificationController.listAllNotifications.bind(notificationController),
    );

    app.post(
        "/send",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Admin: system:manage] Dispatch targeted or broadcast notification",
                description: "Sends custom or template-based notifications across Email, Push, and In-App channels.",
                security: [{ bearerAuth: [] }],
                body: notificationSwaggerSchemas.sendNotification,
            },
        },
        notificationController.sendNotification.bind(notificationController),
    );

    app.post(
        "/:id/retry",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["Notifications & Preferences"],
                summary: "[Admin: system:manage] Retry failed notification delivery",
                description: "Retries a previously failed email or push notification delivery.",
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
        notificationController.retryNotification.bind(notificationController),
    );
}

