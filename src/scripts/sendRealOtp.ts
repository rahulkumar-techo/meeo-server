import "dotenv/config";
import { mailTransporter } from "../lib/mail.js";
import { generateOtpEmail } from "../templates/otp.template.js";

async function sendTestOtp(targetEmail: string) {
    console.log("==========================================");
    console.log("    MEEO Real SMTP OTP Dispatcher         ");
    console.log("==========================================");
    console.log("SMTP Host:", process.env.SMTP_HOST);
    console.log("SMTP Port:", process.env.SMTP_PORT);
    console.log("SMTP User:", process.env.SMTP_USER);
    console.log("Mail From:", process.env.MAIL_FROM);
    console.log("Target Recipient:", targetEmail);
    console.log("------------------------------------------");

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const emailContent = generateOtpEmail({
        firstName: "Rahul",
        lastName: "Kumar",
        otpCode,
        appName: "MEEO Store",
    });

    try {
        console.log("\n1. Verifying SMTP connection...");
        await mailTransporter.verify();
        console.log("✅ SMTP connection verified successfully!");

        console.log("\n2. Sending real OTP email to:", targetEmail);
        const info = await mailTransporter.sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to: targetEmail,
            subject: `[MEEO Store] Your Verification OTP: ${otpCode}`,
            html: emailContent.html,
            text: emailContent.text,
        });

        console.log("\n🎉 SUCCESS: Email delivered to SMTP server!");
        console.log("Message ID:", info.messageId);
        console.log("Response:", info.response);
        console.log("Sent OTP Code:", otpCode);
    } catch (err: any) {
        console.error("\n❌ FAILED TO SEND EMAIL:");
        console.error("Error Message:", err.message);
        if (err.response) {
            console.error("SMTP Response:", err.response);
        }
        if (err.code) {
            console.error("Error Code:", err.code);
        }
    }
}

const target = process.argv[2] || "rahulkumar9142684664@gmail.com";
sendTestOtp(target);
