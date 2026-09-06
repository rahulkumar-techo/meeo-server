import type { FastifyRequest, FastifyReply } from "fastify";
import { notificationDispatcherService } from "../services/notificationDispatcher.service.js";
import { notificationPreferenceService } from "../services/notificationPreference.service.js";
import {
    notificationQuerySchema,
    updateNotificationPreferencesSchema,
    sendNotificationSchema,
} from "../validations/notification.validation.js";

export class NotificationController {
    /**
     * Lists in-app notifications for the authenticated user.
     */
    async listMyNotifications(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const query = notificationQuerySchema.parse(req.query);
        const result = await notificationDispatcherService.listUserNotifications(userId, query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Retrieves the count of unread notifications for the authenticated user.
     */
    async getUnreadCount(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const count = await notificationDispatcherService.getUnreadCount(userId);

        return reply.status(200).send({
            status: "success",
            data: { unreadCount: count },
        });
    }

    /**
     * Marks a specific notification as read.
     */
    async markAsRead(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const { id } = req.params as { id: string };
        const result = await notificationDispatcherService.markNotificationAsRead(userId, id);

        return reply.status(200).send({
            status: "success",
            message: "Notification marked as read",
            data: result,
        });
    }

    /**
     * Marks all notifications as read for the authenticated user.
     */
    async markAllAsRead(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const result = await notificationDispatcherService.markAllAsRead(userId);

        return reply.status(200).send({
            status: "success",
            message: `Marked ${result.count} notification(s) as read`,
            data: result,
        });
    }

    /**
     * Dismisses or deletes a notification.
     */
    async deleteNotification(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const { id } = req.params as { id: string };
        const result = await notificationDispatcherService.deleteNotification(userId, id);

        return reply.status(200).send({
            status: "success",
            message: "Notification deleted",
            data: result,
        });
    }

    /**
     * Retrieves notification channels & category preferences for the authenticated user.
     */
    async getPreferences(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const result = await notificationPreferenceService.getUserPreferences(userId);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Updates notification preferences for the authenticated user.
     */
    async updatePreferences(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const input = updateNotificationPreferencesSchema.parse(req.body);
        const result = await notificationPreferenceService.updateUserPreferences(userId, input);

        return reply.status(200).send({
            status: "success",
            message: "Notification preferences updated successfully",
            data: result,
        });
    }

    /**
     * Admin manual notification dispatch across selected channels.
     */
    async sendNotification(req: FastifyRequest, reply: FastifyReply) {
        const input = sendNotificationSchema.parse(req.body);
        const result = await notificationDispatcherService.sendManualNotification(input);

        return reply.status(200).send({
            status: "success",
            message: "Notification dispatched successfully",
            data: result,
        });
    }

    /**
     * Admin retry for a failed notification delivery.
     */
    async retryNotification(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await notificationDispatcherService.retryFailedNotification(id);

        return reply.status(200).send({
            status: "success",
            message: "Notification retry processed",
            data: result,
        });
    }
}

export const notificationController = new NotificationController();
