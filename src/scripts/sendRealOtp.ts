import "dotenv/config.js";
import { mailService } from "../common/mail/send.mail.js";
import { generateOtpEmail } from "../templates/otp.template.js";

async function main() {
    const targetEmail = process.argv[2] || "rahulkumar9142684664@gmail.com";
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    console.log("==========================================");
    console.log("       MEEO Brevo OTP Verification Tool    ");
    console.log("==========================================");
    console.log(`Sending real OTP (${otp}) to: ${targetEmail}`);

    try {
        const template = generateOtpEmail({
            firstName: "Valued",
            lastName: "Customer",
            otpCode: otp,
            appName: "MEEO Store",
        });

        const result = await mailService.sendMail({
            to: targetEmail,
            subject: `[MEEO Store] Your Verification OTP: ${otp}`,
            html: template.html,
            text: template.text,
        });

        console.log("✅ OTP successfully dispatched via Brevo!");
        console.log("Response:", result);
    } catch (err: any) {
        console.error("❌ Failed to send OTP:", err.message);
        process.exit(1);
    }
}

main();
