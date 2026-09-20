import { mailTransporter } from "@/lib/mail.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendEmailOptions {
    to: string;
    content: NotificationContent;
    from?: string;
}

export class EmailProvider {
    /**
     * Sends an email notification using Nodemailer / SMTP transporter.
     */
    async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; success: boolean }> {
        const { to, content, from } = options;
        const sender = from || process.env.SMTP_FROM || '"E-Commerce Store" <no-reply@store.com>';

        try {
            console.log(`[SMTP-Notification] 📤 Dispatching email notification to: ${to} | Subject: "${content.subject}"`);
            const info = await mailTransporter.sendMail({
                from: sender,
                to,
                subject: content.subject,
                text: content.body,
                html: content.html,
            });

            console.log(`[SMTP-Notification] ✅ Notification email delivered to ${to} | Message ID: ${info?.messageId}`);

            return {
                messageId: info?.messageId || `mock-mail-${Date.now()}`,
                success: true,
            };
        } catch (err: any) {
            console.error(`[SMTP-Notification] ❌ Failed to send email to ${to}:`, err.message);
            throw err;
        }
    }
}

export const emailProvider = new EmailProvider();
