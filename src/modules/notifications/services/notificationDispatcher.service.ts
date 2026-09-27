import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { emailProvider } from "@/workers/providers/email.provider.js";
import { pushProvider } from "@/workers/providers/push.provider.js";
import {
    notificationDeliveryService,
    type EventRecipient,
    type DispatchResult,
} from "@/workers/services/notificationDelivery.service.js";
import type {
    NotificationQueryInput,
    SendNotificationInput,
    AdminNotificationFilterInput,
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

    /**
     * Lists all notifications across the platform with multi-field search, status, channel, and date filters for Admin.
     */
    async listAllNotifications(query: AdminNotificationFilterInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (query.userId) {
            where.userId = query.userId;
        }
        if (query.channel) {
            where.channel = query.channel;
        }
        if (query.status) {
            where.status = query.status;
        }
        if (query.type) {
            where.type = query.type;
        }

        if (query.startDate || query.endDate) {
            where.createdAt = {};
            if (query.startDate) {
                where.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                where.createdAt.lte = new Date(query.endDate);
            }
        }

        if (query.search) {
            const searchTerm = query.search.trim();
            where.OR = [
                { title: { contains: searchTerm, mode: "insensitive" } },
                { body: { contains: searchTerm, mode: "insensitive" } },
                { user: { email: { contains: searchTerm, mode: "insensitive" } } },
                { user: { firstName: { contains: searchTerm, mode: "insensitive" } } },
                { user: { lastName: { contains: searchTerm, mode: "insensitive" } } },
            ];
        }

        const [items, total, channelStats, statusStats] = await Promise.all([
            prisma.notification.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                        },
                    },
                },
            }),
            prisma.notification.count({ where }),
            prisma.notification.groupBy({
                by: ["channel"],
                where,
                _count: { _all: true },
            }),
            prisma.notification.groupBy({
                by: ["status"],
                where,
                _count: { _all: true },
            }),
        ]);

        const channelCounts = {
            EMAIL: channelStats.find((c) => c.channel === "EMAIL")?._count._all ?? 0,
            PUSH: channelStats.find((c) => c.channel === "PUSH")?._count._all ?? 0,
            IN_APP: channelStats.find((c) => c.channel === "IN_APP")?._count._all ?? 0,
        };

        const statusCounts = {
            SENT: statusStats.find((s) => s.status === "SENT")?._count._all ?? 0,
            FAILED: statusStats.find((s) => s.status === "FAILED")?._count._all ?? 0,
            PENDING: statusStats.find((s) => s.status === "PENDING")?._count._all ?? 0,
            READ: statusStats.find((s) => s.status === "READ")?._count._all ?? 0,
        };

        return {
            items,
            summary: {
                total,
                channelCounts,
                statusCounts,
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Aggregated metrics and overview KPIs for Admin Notification Dashboard.
     */
    async getAdminOverview() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [
            totalNotifications,
            todayNotifications,
            channelGroup,
            statusGroup,
            deviceTotal,
            deviceActive,
            devicePlatforms,
            recentFailures,
        ] = await Promise.all([
            prisma.notification.count(),
            prisma.notification.count({ where: { createdAt: { gte: todayStart } } }),
            prisma.notification.groupBy({
                by: ["channel"],
                _count: { _all: true },
            }),
            prisma.notification.groupBy({
                by: ["status"],
                _count: { _all: true },
            }),
            prisma.deviceToken.count(),
            prisma.deviceToken.count({ where: { isActive: true } }),
            prisma.deviceToken.groupBy({
                by: ["platform"],
                where: { isActive: true },
                _count: { _all: true },
            }),
            prisma.notification.findMany({
                where: { status: "FAILED" },
                take: 5,
                orderBy: { createdAt: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            }),
        ]);

        const channelBreakdown = {
            EMAIL: channelGroup.find((g) => g.channel === "EMAIL")?._count._all ?? 0,
            PUSH: channelGroup.find((g) => g.channel === "PUSH")?._count._all ?? 0,
            IN_APP: channelGroup.find((g) => g.channel === "IN_APP")?._count._all ?? 0,
        };

        const statusBreakdown = {
            SENT: statusGroup.find((g) => g.status === "SENT")?._count._all ?? 0,
            FAILED: statusGroup.find((g) => g.status === "FAILED")?._count._all ?? 0,
            PENDING: statusGroup.find((g) => g.status === "PENDING")?._count._all ?? 0,
            READ: statusGroup.find((g) => g.status === "READ")?._count._all ?? 0,
        };

        const successfulDeliveries = statusBreakdown.SENT + statusBreakdown.READ;
        const totalResolved = successfulDeliveries + statusBreakdown.FAILED;
        const successRate = totalResolved > 0 ? Number(((successfulDeliveries / totalResolved) * 100).toFixed(1)) : 100;

        const platformBreakdown = {
            web: devicePlatforms.find((p) => p.platform === "web")?._count._all ?? 0,
            android: devicePlatforms.find((p) => p.platform === "android")?._count._all ?? 0,
            ios: devicePlatforms.find((p) => p.platform === "ios")?._count._all ?? 0,
        };

        return {
            overview: {
                totalNotifications,
                todayNotifications,
                successfulDeliveries,
                failedDeliveries: statusBreakdown.FAILED,
                pendingDeliveries: statusBreakdown.PENDING,
                successRate,
            },
            channelBreakdown,
            statusBreakdown,
            devices: {
                totalRegistered: deviceTotal,
                activeDevices: deviceActive,
                platforms: platformBreakdown,
            },
            recentFailures,
        };
    }
}

export const notificationDispatcherService = new NotificationDispatcherService();

