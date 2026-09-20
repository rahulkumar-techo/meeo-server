import { mailTransporter } from "@/lib/mail.js";

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class MailService {
  async sendMail({
    to,
    subject,
    html,
    text,
  }: SendMailOptions) {
    console.log(`[SMTP] 📤 Attempting to send email...`);
    console.log(`[SMTP] ├─ To: ${to}`);
    console.log(`[SMTP] ├─ From: ${process.env.MAIL_FROM || process.env.SMTP_USER}`);
    console.log(`[SMTP] └─ Subject: "${subject}"`);

    try {
      const info = await mailTransporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
        text,
      });

      console.log(`[SMTP] ✅ Email delivered successfully!`);
      console.log(`[SMTP] ├─ Message ID: ${info.messageId}`);
      console.log(`[SMTP] └─ Response: ${info.response}`);
      return info;
    } catch (err: any) {
      console.error(`[SMTP] ❌ Email delivery failed for ${to}:`, err.message);
      if (err.response) {
        console.error(`[SMTP] └─ SMTP Server Response:`, err.response);
      }
      throw err;
    }
  }
}

export const mailService = new MailService();