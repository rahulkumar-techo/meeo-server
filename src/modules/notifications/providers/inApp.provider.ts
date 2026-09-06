import { prisma } from "@/lib/prisma.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendInAppOptions {
    userId: string;
    type: string;
    content: NotificationContent;
}

export class InAppProvider {
    /**
     * Persists an in-app notification in the PostgreSQL database.
     */
    async createInAppNotification(options: SendInAppOptions) {
        const { userId, type, content } = options;

        return prisma.notification.create({
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
    }
}

export const inAppProvider = new InAppProvider();
