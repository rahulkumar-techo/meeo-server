import { prisma } from "@/lib/prisma.js";
import { emailProvider } from "../providers/email.provider.js";
import { pushProvider } from "../providers/push.provider.js";
import { notificationPreferenceService } from "@/modules/notifications/services/notificationPreference.service.js";
import {
    renderNotificationContent,
    NOTIFICATION_TEMPLATES,
    type NotificationContent,
} from "../templates/notificationTemplates.js";

export interface EventRecipient {
    userId?: string | undefined;
    email?: string | undefined;
    deviceToken?: string | undefined;
    customerName?: string | undefined;
}

export interface DispatchResult {
    eventType: string;
    deliveryMode: "PUSH_AND_EMAIL" | "PUSH_ONLY" | "EMAIL_ONLY" | "NONE" | string;
    channelsAttempted: string[];
    results: {
        channel: string;
        success: boolean;
        error?: string;
    }[];
}

export class NotificationDeliveryService {
    /**
     * Smart multi-channel dispatch:
     * - Push notifications are prioritized everywhere for real-time mobile & web alerts.
     * - Mail is saved and used smartly:
     *     * Always sent for Billing, Invoices, Payment Receipts, and Security alerts.
     *     * For operational events (shipped, out for delivery, etc.), email is sent only as a fallback if push is unavailable.
     * - No in-app notifications.
     */
    async sendNotificationForEvent(
        eventType: string,
        recipient: EventRecipient,
        variables: Record<string, any> = {},
    ): Promise<DispatchResult> {
        const templateDef = NOTIFICATION_TEMPLATES[eventType];
        const category = templateDef?.category ?? "order";

        // Enrich variables with recipient details
        const enrichedVars: Record<string, any> = {
            customerName: recipient.customerName || "Valued Customer",
            ...variables,
        };

        const { userId } = recipient;
        let targetEmail = recipient.email;

        // Auto-fetch user details if only userId is provided
        if (userId && (!targetEmail || !recipient.customerName) && prisma.user?.findUnique) {
            try {
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true, firstName: true, lastName: true },
                });
                if (user?.email && !targetEmail) {
                    targetEmail = user.email;
                }
                if (user?.firstName && !recipient.customerName) {
                    enrichedVars.customerName = `${user.firstName} ${user.lastName || ""}`.trim();
                }
            } catch {
                // Ignore lookup errors
            }
        }

        const content = renderNotificationContent(eventType, enrichedVars);

        const result: DispatchResult = {
            eventType,
            deliveryMode: "NONE",
            channelsAttempted: [],
            results: [],
        };

        let pushDelivered = false;
        let emailDelivered = false;

        // --------------------------------------------------------------------
        // CHANNEL 1: Push Notification (Web / Android / iOS / Expo device tokens)
        // Dispatched everywhere for real-time customer updates
        // --------------------------------------------------------------------
        let targetTokens: (string | undefined)[] = recipient.deviceToken ? [recipient.deviceToken] : [];

        const hasPushContent = Boolean(content.pushTitle || content.pushBody);
        if (userId && hasPushContent) {
            const isPushAllowed = await notificationPreferenceService.isNotificationAllowed(userId, "PUSH", category);
            if (isPushAllowed) {
                if (targetTokens.length === 0 && prisma.deviceToken?.findMany) {
                    try {
                        const devices = await prisma.deviceToken.findMany({
                            where: { userId, isActive: true },
                            select: { token: true },
                        });
                        targetTokens = devices.map((d) => d.token);
                    } catch {
                        targetTokens = [];
                    }
                }

                if (targetTokens.length > 0) {
                    result.channelsAttempted.push("PUSH");
                    let atLeastOneSuccess = false;
                    let lastPushError: string | null = null;

                    for (const token of targetTokens) {
                        if (token) {
                            try {
                                await pushProvider.sendPush({
                                    userId,
                                    deviceToken: token,
                                    content,
                                });
                                atLeastOneSuccess = true;
                            } catch (err: any) {
                                lastPushError = err.message;
                            }
                        }
                    }

                    if (atLeastOneSuccess) {
                        pushDelivered = true;
                        result.results.push({ channel: "PUSH", success: true });
                        if (prisma.notification?.create) {
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
                            }).catch(() => null);
                        }
                    } else {
                        result.results.push({ channel: "PUSH", success: false, error: lastPushError || "Push delivery failed" });
                        if (prisma.notification?.create) {
                            await prisma.notification.create({
                                data: {
                                    userId,
                                    type: eventType,
                                    title: content.pushTitle || content.title,
                                    body: content.pushBody || content.body,
                                    channel: "PUSH",
                                    status: "FAILED",
                                    attempts: 1,
                                    lastError: lastPushError,
                                    data: content.data ?? {},
                                },
                            }).catch(() => null);
                        }
                    }
                }
            }
        }

        // --------------------------------------------------------------------
        // CHANNEL 2: Transactional Email / Mail
        // Sent strictly for the 2 main notifications:
        // 1. Billing / Order Invoices (ORDER_PAID, PAYMENT_SUCCESS, ORDER_CONFIRMED)
        // 2. Delivered / Purchase Billing Confirmation (ORDER_DELIVERED)
        // Operational status updates (shipped, out for delivery, processing) use Push only.
        // --------------------------------------------------------------------
        const shouldSendEmail = Boolean(targetEmail && templateDef?.sendEmailByDefault);

        if (shouldSendEmail && targetEmail) {
            const isEmailAllowed = await notificationPreferenceService.isNotificationAllowed(userId, "EMAIL", category);
            if (isEmailAllowed) {
                result.channelsAttempted.push("EMAIL");
                try {
                    await emailProvider.sendEmail({
                        to: targetEmail,
                        content,
                    });

                    if (prisma.notification?.create) {
                        await prisma.notification.create({
                            data: {
                                userId: userId ?? null,
                                type: eventType,
                                title: content.subject,
                                body: content.body,
                                channel: "EMAIL",
                                status: "SENT",
                                sentAt: new Date(),
                                data: { recipientEmail: targetEmail, ...content.data },
                            },
                        }).catch(() => null);
                    }

                    emailDelivered = true;
                    result.results.push({ channel: "EMAIL", success: true });
                } catch (err: any) {
                    if (prisma.notification?.create) {
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
                                data: { recipientEmail: targetEmail, ...content.data },
                            },
                        }).catch(() => null);
                    }

                    result.results.push({ channel: "EMAIL", success: false, error: err.message });
                }
            }
        }

        if (pushDelivered && emailDelivered) {
            result.deliveryMode = "PUSH_AND_EMAIL";
        } else if (pushDelivered) {
            result.deliveryMode = "PUSH_ONLY";
        } else if (emailDelivered) {
            result.deliveryMode = "EMAIL_ONLY";
        }

        return result;
    }

    /**
     * Manual notification dispatch across selected push/mail channels.
     */
    async sendManualNotification(input: {
        userId?: string | undefined;
        recipientEmail?: string | undefined;
        type: string;
        title: string;
        body: string;
        channels: ("EMAIL" | "PUSH" | "IN_APP")[];
        data?: Record<string, any> | undefined;
    }) {
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
            if (ch === "EMAIL" && recipientEmail) {
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
