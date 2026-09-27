import { prisma } from "@/lib/prisma.js";
import { emitToUser } from "@/sockets/socket.server.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendInAppOptions {
    userId: string;
    type: string;
    content: NotificationContent;
}

export class InAppProvider {
    /**
     * Persists an in-app notification in PostgreSQL and delivers real-time push via WebSockets.
     */
    async createInAppNotification(options: SendInAppOptions) {
        const { userId, type, content } = options;

        const notification = await prisma.notification.create({
            data: {
                userId,
                type,
                title: content.title,
                body: content.body,
                channel: "IN_APP",
                status: "SENT",
                sentAt: new Date(),
                data: content.data ?? {},
            },
        });

        // Broadcast real-time event to user's WebSocket room
        emitToUser(userId, "notification:new" as any, notification).catch(() => {});

        return notification;
    }
}

export const inAppProvider = new InAppProvider();
