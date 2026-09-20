import { getBrevoClient } from "@/lib/brevo.js";

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class MailService {
  /**
   * Sends transactional email using Brevo API.
   */
  async sendMail({
    to,
    subject,
    html,
    text,
  }: SendMailOptions): Promise<{ messageId?: string | undefined; [key: string]: any }> {
    const brevo = getBrevoClient();
    const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM || "no-reply@meeo.com";
    const brevoSenderName = process.env.BREVO_SENDER_NAME || "MEEO Store";

    if (!brevo) {
      console.warn(`[Brevo] ⚠️ BREVO_API_KEY is not configured. Email to ${to} was skipped/mocked.`);
      return { messageId: `mock-brevo-id-${Date.now()}` };
    }

    console.log(`[Brevo] 📤 Dispatching transactional email...`);
    console.log(`[Brevo] ├─ To: ${to}`);
    console.log(`[Brevo] ├─ From: ${brevoSenderName} <${brevoSenderEmail}>`);
    console.log(`[Brevo] └─ Subject: "${subject}"`);

    try {
      const response = await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: brevoSenderName, email: brevoSenderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...(text ? { textContent: text } : {}),
      });

      console.log(`[Brevo] ✅ Email delivered successfully via Brevo API!`);
      const messageId = response.messageId || (response as any).messageIds?.join(", ") || "sent";
      console.log(`[Brevo] └─ Message ID: ${messageId}`);
      return { messageId, ...response };
    } catch (err: any) {
      console.error(`[Brevo] ❌ Failed to send transactional email to ${to}:`, err.message || err);
      throw err;
    }
  }
}

export const mailService = new MailService();