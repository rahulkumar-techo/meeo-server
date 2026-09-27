import { mailService } from "@/common/mail/send.mail.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendEmailOptions {
    to: string;
    content: NotificationContent;
    from?: string;
}

export class EmailProvider {
    /**
     * Sends a transactional email notification via Brevo/SMTP.
     */
    async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; success: boolean }> {
        const { to, content } = options;

        try {
            console.log(`[EmailProvider] 📤 Dispatching email to: ${to} | Subject: "${content.subject}"`);
            const info = await mailService.sendMail({
                to,
                subject: content.subject,
                text: content.body,
                html: content.html,
            });

            console.log(`[EmailProvider] ✅ Email delivered to ${to} | Message ID: ${info?.messageId}`);

            return {
                messageId: info?.messageId || `mock-mail-${Date.now()}`,
                success: true,
            };
        } catch (err: any) {
            console.error(`[EmailProvider] ❌ Failed to send email to ${to}:`, err.message);
            throw err;
        }
    }
}

export const emailProvider = new EmailProvider();
