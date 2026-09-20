import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { emailProvider } from "../providers/email.provider.js";
import { pushProvider } from "../providers/push.provider.js";
import {
    notificationDeliveryService,
    type EventRecipient,
    type DispatchResult,
} from "./notificationDelivery.service.js";
import type {
    NotificationQueryInput,
    SendNotificationInput,
} from "../validations/notification.validation.js";

export type { EventRecipient, DispatchResult };

export class NotificationDispatcherService {
    /**
     * Dispatches multi-channel notifications triggered by a background domain event.
     */
    async sendNotificationForEvent(
        eventType: string,
        recipient: EventRecipient,
        variables: Record<string, any> = {},
    ): Promise<DispatchResult> {
        return notificationDeliveryService.sendNotificationForEvent(eventType, recipient, variables);
    }

    /**
     * Lists in-app notifications for an authenticated user with pagination and filters.
     */
    async listUserNotifications(userId: string, query: NotificationQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = { userId };
        if (query.unreadOnly) {
            where.readAt = null;
        }
        if (query.type) {
            where.type = query.type;
        }
        if (query.channel) {
            where.channel = query.channel;
        }
        if (query.status) {
            where.status = query.status;
        }

        const [items, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({ where: { userId, readAt: null } }),
        ]);

        return {
            items,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Gets unread notification count for a user.
     */
    async getUnreadCount(userId: string): Promise<number> {
        return prisma.notification.count({
            where: { userId, readAt: null },
        });
    }

    /**
     * Marks a single notification as read.
     */
    async markNotificationAsRead(userId: string, notificationId: string) {
        const notification = await prisma.notification.findFirst({
            where: { id: notificationId, userId },
        });

        if (!notification) {
            throw new AppError("Notification not found", 404);
        }

        return prisma.notification.update({
            where: { id: notificationId },
            data: {
                readAt: new Date(),
                status: "READ",
            },
        });
    }

    /**
     * Marks all notifications as read for a user.
     */
    async markAllAsRead(userId: string): Promise<{ count: number }> {
        const result = await prisma.notification.updateMany({
            where: { userId, readAt: null },
            data: {
                readAt: new Date(),
                status: "READ",
            },
        });

        return { count: result.count };
    }

    /**
     * Deletes a user notification.
     */
    async deleteNotification(userId: string, notificationId: string) {
        const notification = await prisma.notification.findFirst({
            where: { id: notificationId, userId },
        });

        if (!notification) {
            throw new AppError("Notification not found", 404);
        }

        await prisma.notification.delete({
            where: { id: notificationId },
        });

        return { deleted: true, id: notificationId };
    }

    /**
     * Retries a failed notification delivery.
     */
    async retryFailedNotification(notificationId: string) {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            throw new AppError("Notification record not found", 404);
        }

        if (notification.status !== "FAILED") {
            throw new AppError(`Notification is not in FAILED state (current: ${notification.status})`, 400);
        }

        const nextAttempts = notification.attempts + 1;
        const rawData = (notification.data as Record<string, any>) || {};

        try {
            if (notification.channel === "EMAIL") {
                const recipientEmail = rawData.recipientEmail;
                if (!recipientEmail) {
                    throw new Error("Recipient email address missing in notification data");
                }

                await emailProvider.sendEmail({
                    to: recipientEmail,
                    content: {
                        subject: notification.title,
                        title: notification.title,
                        body: notification.body || "",
                        html: `<p>${notification.body}</p>`,
                    },
                });
            } else if (notification.channel === "PUSH" && notification.userId) {
                await pushProvider.sendPush({
                    userId: notification.userId,
                    content: {
                        subject: notification.title,
                        title: notification.title,
                        body: notification.body || "",
                        html: `<p>${notification.body}</p>`,
                    },
                });
            }

            return prisma.notification.update({
                where: { id: notificationId },
                data: {
                    status: "SENT",
                    attempts: nextAttempts,
                    sentAt: new Date(),
                    lastError: null,
                },
            });
        } catch (err: any) {
            return prisma.notification.update({
                where: { id: notificationId },
                data: {
                    attempts: nextAttempts,
                    lastError: err.message,
                },
            });
        }
    }

    /**
     * Admin manual notification dispatch.
     */
    async sendManualNotification(input: SendNotificationInput) {
        return notificationDeliveryService.sendManualNotification(input);
    }
}

export const notificationDispatcherService = new NotificationDispatcherService();
