import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendPushOptions {
    userId: string;
    deviceToken?: string | undefined;
    content: NotificationContent;
}

export class PushProvider {
    /**
     * Dispatches a mobile/web push notification to a user device.
     */
    async sendPush(options: SendPushOptions): Promise<{ ticketId: string; success: boolean }> {
        const { userId, deviceToken, content } = options;

        // In production, integrate with FCM (Firebase Cloud Messaging), APNS, or WebPush.
        // For development and test, log push delivery.
        console.log(`[PushProvider] Dispatching push to user ${userId} (Token: ${deviceToken || "default-token"}): "${content.pushTitle}" - "${content.pushBody}"`);

        return {
            ticketId: `push-${userId}-${Date.now()}`,
            success: true,
        };
    }
}

export const pushProvider = new PushProvider();
