import { prisma } from "@/lib/prisma.js";
import { emailProvider } from "../providers/email.provider.js";
import { pushProvider } from "../providers/push.provider.js";
import { inAppProvider } from "../providers/inApp.provider.js";
import { notificationPreferenceService } from "./notificationPreference.service.js";
import {
    renderNotificationContent,
    NOTIFICATION_TEMPLATES,
    type NotificationContent,
} from "../templates/notificationTemplates.js";
import type { SendNotificationInput } from "../validations/notification.validation.js";

export interface EventRecipient {
    userId?: string | undefined;
    email?: string | undefined;
    deviceToken?: string | undefined;
    customerName?: string | undefined;
}

export interface DispatchResult {
    eventType: string;
    channelsAttempted: string[];
    results: {
        channel: string;
        success: boolean;
        error?: string;
    }[];
}

export class NotificationDeliveryService {
    /**
     * Dispatches multi-channel notifications triggered by a background domain event.
     */
    async sendNotificationForEvent(
        eventType: string,
        recipient: EventRecipient,
        variables: Record<string, any> = {},
    ): Promise<DispatchResult> {
        const templateDef = NOTIFICATION_TEMPLATES[eventType];
        const category = templateDef?.category ?? "orderUpdates";

        // Enrich variables with recipient details
        const enrichedVars = {
            customerName: recipient.customerName || "Valued Customer",
            ...variables,
        };

        const content = renderNotificationContent(eventType, enrichedVars);
        const result: DispatchResult = {
            eventType,
            channelsAttempted: [],
            results: [],
        };

        const { userId, email, deviceToken } = recipient;

        // 1. In-App Notification (if user is authenticated)
        if (userId) {
            const isAllowed = await notificationPreferenceService.isNotificationAllowed(userId, "IN_APP", category);
            if (isAllowed) {
                result.channelsAttempted.push("IN_APP");
                try {
                    await inAppProvider.createInAppNotification({
                        userId,
                        type: eventType,
                        content,
                    });
                    result.results.push({ channel: "IN_APP", success: true });
                } catch (err: any) {
                    console.error(`[NotificationDelivery] In-App delivery failed for user ${userId}:`, err.message);
                    result.results.push({ channel: "IN_APP", success: false, error: err.message });
                }
            }
        }

        // 2. Email Notification (if recipient email is available)
        if (email) {
            const isAllowed = await notificationPreferenceService.isNotificationAllowed(userId, "EMAIL", category);
            if (isAllowed) {
                result.channelsAttempted.push("EMAIL");
                try {
                    await emailProvider.sendEmail({
                        to: email,
                        content,
                    });

                    // Record email notification log
                    await prisma.notification.create({
                        data: {
                            userId: userId ?? null,
                            type: eventType,
                            title: content.subject,
                            body: content.body,
                            channel: "EMAIL",
                            status: "SENT",
                            sentAt: new Date(),
                            data: { recipientEmail: email, ...content.data },
                        },
                    });

                    result.results.push({ channel: "EMAIL", success: true });
                } catch (err: any) {
                    await prisma.notification.create({
                        data: {
                            userId: userId ?? null,
                            type: eventType,
                            title: content.subject,
                            body: content.body,
                            channel: "EMAIL",
                            status: "FAILED",
                            attempts: 1,
                            lastError: err.message,
                            data: { recipientEmail: email, ...content.data },
                        },
                    });

                    result.results.push({ channel: "EMAIL", success: false, error: err.message });
                }
            }
        }

        // 3. Push Notification (if user / deviceToken is available)
        if (userId) {
            const isAllowed = await notificationPreferenceService.isNotificationAllowed(userId, "PUSH", category);
            if (isAllowed) {
                result.channelsAttempted.push("PUSH");
                try {
                    await pushProvider.sendPush({
                        userId,
                        deviceToken,
                        content,
                    });

                    await prisma.notification.create({
                        data: {
                            userId,
                            type: eventType,
                            title: content.pushTitle || content.title,
                            body: content.pushBody || content.body,
                            channel: "PUSH",
                            status: "SENT",
                            sentAt: new Date(),
                            data: content.data ?? {},
                        },
                    });

                    result.results.push({ channel: "PUSH", success: true });
                } catch (err: any) {
                    await prisma.notification.create({
                        data: {
                            userId,
                            type: eventType,
                            title: content.pushTitle || content.title,
                            body: content.pushBody || content.body,
                            channel: "PUSH",
                            status: "FAILED",
                            attempts: 1,
                            lastError: err.message,
                            data: content.data ?? {},
                        },
                    });

                    result.results.push({ channel: "PUSH", success: false, error: err.message });
                }
            }
        }

        return result;
    }

    /**
     * Admin manual notification dispatch.
     */
    async sendManualNotification(input: SendNotificationInput) {
        const { userId, recipientEmail, type, title, body, channels, data } = input;
        const content: NotificationContent = {
            subject: title,
            title,
            body,
            html: `<div style="font-family: Arial, sans-serif; padding: 16px;"><h2>${title}</h2><p>${body}</p></div>`,
            pushTitle: title,
            pushBody: body,
            data: data ?? {},
        };

        const results: any[] = [];

        for (const ch of channels) {
            if (ch === "IN_APP" && userId) {
                const inApp = await inAppProvider.createInAppNotification({
                    userId,
                    type,
                    content,
                });
                results.push({ channel: "IN_APP", success: true, id: inApp.id });
            } else if (ch === "EMAIL" && recipientEmail) {
                try {
                    await emailProvider.sendEmail({ to: recipientEmail, content });
                    const record = await prisma.notification.create({
                        data: {
                            userId: userId ?? null,
                            type,
                            title,
                            body,
                            channel: "EMAIL",
                            status: "SENT",
                            sentAt: new Date(),
                            data: { recipientEmail, ...data },
                        },
                    });
                    results.push({ channel: "EMAIL", success: true, id: record.id });
                } catch (err: any) {
                    const record = await prisma.notification.create({
                        data: {
                            userId: userId ?? null,
                            type,
                            title,
                            body,
                            channel: "EMAIL",
                            status: "FAILED",
                            attempts: 1,
                            lastError: err.message,
                            data: { recipientEmail, ...data },
                        },
                    });
                    results.push({ channel: "EMAIL", success: false, error: err.message, id: record.id });
                }
            } else if (ch === "PUSH" && userId) {
                try {
                    await pushProvider.sendPush({ userId, content });
                    const record = await prisma.notification.create({
                        data: {
                            userId,
                            type,
                            title,
                            body,
                            channel: "PUSH",
                            status: "SENT",
                            sentAt: new Date(),
                            data: data ?? {},
                        },
                    });
                    results.push({ channel: "PUSH", success: true, id: record.id });
                } catch (err: any) {
                    results.push({ channel: "PUSH", success: false, error: err.message });
                }
            }
        }

        return { dispatched: true, results };
    }
}

export const notificationDeliveryService = new NotificationDeliveryService();
