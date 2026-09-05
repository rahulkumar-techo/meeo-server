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
    return mailTransporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    });
  }
}

export const mailService = new MailService();