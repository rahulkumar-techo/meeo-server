import "dotenv/config";
import nodemailer from "nodemailer";
import { mailTransporter } from "../lib/mail.js";
import { generateOtpEmail } from "../templates/otp.template.js";

async function run() {
    console.log("==========================================");
    console.log("       MEEO SMTP OTP Verification Tool    ");
    console.log("==========================================");
    console.log("Current .env Settings:");
    console.log("Host:", process.env.SMTP_HOST);
    console.log("Port:", process.env.SMTP_PORT);
    console.log("User:", process.env.SMTP_USER);
    console.log("From:", process.env.MAIL_FROM);
    console.log("------------------------------------------");

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const emailContent = generateOtpEmail({
        firstName: "Developer",
        lastName: "Tester",
        otpCode,
        appName: "MEEO E-Commerce",
    });

    // 1. Attempt using configured .env SMTP transporter
    console.log("\n[Attempt 1] Testing with configured .env SMTP...");
    try {
        await mailTransporter.verify();
        console.log("✅ .env SMTP connection verified successfully!");

        const targetEmail = process.env.SMTP_USER || "test@example.com";
        const info = await mailTransporter.sendMail({
            from: process.env.MAIL_FROM,
            to: targetEmail,
            subject: `[MEEO Store] Your Verification OTP: ${otpCode}`,
            html: emailContent.html,
            text: emailContent.text,
        });

        console.log("✅ Real OTP email sent successfully via configured SMTP!");
        console.log("Message ID:", info.messageId);
        console.log("Recipient:", targetEmail);
        console.log("Generated OTP Code:", otpCode);
        return;
    } catch (err: any) {
        console.warn("⚠️ Configured .env SMTP failed (Credentials need real Gmail App Password):", err.message);
    }

    // 2. Fallback: Create live Ethereal test account to verify complete transport & template rendering
    console.log("\n[Attempt 2] Initializing live testing SMTP account (Ethereal Email)...");
    try {
        const testAccount = await nodemailer.createTestAccount();
        const etherealTransporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });

        const testRecipient = "customer-verification@example.com";
        const info = await etherealTransporter.sendMail({
            from: `"MEEO Store" <${testAccount.user}>`,
            to: testRecipient,
            subject: `[MEEO Store] Your Verification OTP: ${otpCode}`,
            html: emailContent.html,
            text: emailContent.text,
        });

        console.log("✅ Live OTP email sent and rendered successfully!");
        console.log("Recipient:", testRecipient);
        console.log("Generated OTP Code:", otpCode);
        console.log("Message ID:", info.messageId);
        console.log("🔗 View Sent Email Preview URL in Browser:", nodemailer.getTestMessageUrl(info));
    } catch (err: any) {
        console.error("❌ Live testing transporter failed:", err.message);
    }
}

run();
