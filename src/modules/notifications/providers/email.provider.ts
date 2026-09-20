import { mailService } from "@/common/mail/send.mail.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendEmailOptions {
    to: string;
    content: NotificationContent;
    from?: string;
}

export class EmailProvider {
    /**
     * Sends an email notification using Brevo transactional email service.
     */
    async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; success: boolean }> {
        const { to, content } = options;

        try {
            console.log(`[Email-Notification] 📤 Dispatching notification email to: ${to} | Subject: "${content.subject}"`);
            const info = await mailService.sendMail({
                to,
                subject: content.subject,
                text: content.body,
                html: content.html,
            });

            console.log(`[Email-Notification] ✅ Notification email delivered to ${to} | Message ID: ${info?.messageId}`);

            return {
                messageId: info?.messageId || `mock-mail-${Date.now()}`,
                success: true,
            };
        } catch (err: any) {
            console.error(`[Email-Notification] ❌ Failed to send email notification to ${to}:`, err.message);
            throw err;
        }
    }
}

export const emailProvider = new EmailProvider();
