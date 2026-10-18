// Consumer for handling system alerts and operational notifications.
// Dispatches critical 5xx error alerts to super-admins and users with system management permissions.

import { prisma } from "@/lib/prisma.js";
import { mailService } from "@/common/mail/send.mail.js";
import { logger } from "@/common/observability/logger.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { generateServerAlertEmail } from "@/templates/serverAlert.template.js";

export interface SystemAlertEventPayload {
    count: number;
    threshold: number;
    errorMessage: string;
    stackSnippet?: string | undefined;
    route: string;
    method: string;
    timestamp: string;
    env?: string | undefined;
    dashboardUrl?: string | undefined;
    cooldownMinutes?: number | undefined;
}

export interface SystemAlertEvent {
    id: string;
    eventType: string;
    aggregateType?: string | undefined;
    aggregateId?: string | undefined;
    payload: SystemAlertEventPayload;
    createdAt?: string | Date | undefined;
}

export interface AdminRecipient {
    email: string;
    name: string;
}

export class SystemAlertConsumer {
    readonly consumerName = "SystemAlertConsumer";

    // In-memory cache for resolved admin recipients (5-minute TTL)
    private cachedRecipients: AdminRecipient[] | null = null;
    private cacheExpiresAt = 0;

    /**
     * Resolves all active admin users who have SUPER_ADMIN role or SYSTEM_MANAGE permissions.
     */
    async resolveAdminRecipients(): Promise<AdminRecipient[]> {
        const now = Date.now();
        if (this.cachedRecipients && now < this.cacheExpiresAt) {
            return this.cachedRecipients;
        }

        try {
            const users = await prisma.user.findMany({
                where: {
                    status: "ACTIVE",
                    deletedAt: null,
                    email: { not: null },
                    roles: {
                        some: {
                            role: {
                                OR: [
                                    { name: "SUPER_ADMIN" },
                                    { name: "ADMIN" },
                                    { permissions: { some: { permission: { name: PERMISSIONS.SYSTEM_MANAGE } } } },
                                ],
                            },
                        },
                    },
                },
                select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                },
            });

            const recipients = users
                .filter((u): u is { email: string; firstName: string | null; lastName: string | null } => Boolean(u.email))
                .map((u) => ({
                    email: u.email,
                    name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Administrator",
                }));

            if (recipients.length > 0) {
                this.cachedRecipients = recipients;
                this.cacheExpiresAt = now + 5 * 60 * 1000;
                return recipients;
            }
        } catch (err: any) {
            logger.warn(
                { err: err?.message || err },
                "[SystemAlertConsumer] Failed to query admin recipients from DB, falling back to env configuration",
            );
        }

        // Fallback to configured environment variables if no DB users match
        const fallbackEmail = process.env.ADMIN_ALERT_EMAIL || process.env.ADMIN_EMAIL || "admin@meeo.com";
        const fallbackList: AdminRecipient[] = [{ email: fallbackEmail, name: "System Administrator" }];
        this.cachedRecipients = fallbackList;
        this.cacheExpiresAt = now + 60 * 1000;
        return fallbackList;
    }

    /**
     * Clears recipient cache (useful for tests).
     */
    clearRecipientCache(): void {
        this.cachedRecipients = null;
        this.cacheExpiresAt = 0;
    }

    /**
     * Consumes a system alert event, formats the email using the template, and dispatches to admins.
     */
    async handleEvent(event: SystemAlertEvent): Promise<{
        success: boolean;
        dispatchedCount: number;
        recipients: string[];
    }> {
        const payload = event.payload;
        logger.info(
            { eventId: event.id, eventType: event.eventType, count: payload.count, threshold: payload.threshold },
            "[SystemAlertConsumer] Processing critical system alert event",
        );

        const recipients = await this.resolveAdminRecipients();
        const env = payload.env || process.env.NODE_ENV || "development";
        const dashboardUrl = payload.dashboardUrl || `${process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000"}/system/metrics`;

        const dispatchedEmails: string[] = [];

        for (const recipient of recipients) {
            const { subject, html, text } = generateServerAlertEmail({
                recipientName: recipient.name,
                errorCount: payload.count,
                threshold: payload.threshold,
                env,
                method: payload.method,
                route: payload.route,
                errorMessage: payload.errorMessage,
                stackSnippet: payload.stackSnippet,
                timestamp: payload.timestamp || new Date().toISOString(),
                dashboardUrl,
                cooldownMinutes: payload.cooldownMinutes ?? 15,
            });

            try {
                await mailService.sendMail({
                    to: recipient.email,
                    subject,
                    html,
                    text,
                });
                dispatchedEmails.push(recipient.email);
            } catch (mailErr: any) {
                logger.error(
                    { recipient: recipient.email, err: mailErr?.message || mailErr },
                    "[SystemAlertConsumer] Failed to dispatch alert email to recipient",
                );
            }
        }

        logger.info(
            { eventId: event.id, dispatchedCount: dispatchedEmails.length, recipients: dispatchedEmails },
            "[SystemAlertConsumer] System alert emails dispatched successfully",
        );

        return {
            success: dispatchedEmails.length > 0,
            dispatchedCount: dispatchedEmails.length,
            recipients: dispatchedEmails,
        };
    }
}

export const systemAlertConsumer = new SystemAlertConsumer();
