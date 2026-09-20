import "dotenv/config";
import { BrevoClient } from "@getbrevo/brevo";
import { generateOtpEmail } from "../templates/otp.template.js";

async function testBrevo() {
    console.log("==========================================");
    console.log("       MEEO Brevo Integration Test        ");
    console.log("==========================================");

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_API_KEY_HERE") {
        console.error("❌ ERROR: BREVO_API_KEY is missing in your .env file!");
        console.log("Please add to .env: BREVO_API_KEY=\"xkeysib-...\"");
        return;
    }

    console.log("API Key configured:", `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

    try {
        console.log("\n1. Initializing BrevoClient and checking account connectivity...");
        const client = new BrevoClient({
            apiKey,
        });

        const account = await client.account.getAccount();
        console.log("✅ Brevo Account connected successfully!");
        console.log("├─ Email:", account.email);
        console.log("├─ Company:", account.companyName);
        console.log("└─ Plan:", account.plan?.[0]?.type || "Active");

        const targetEmail = process.argv[2] || account.email;
        console.log(`\n2. Sending test OTP email to: ${targetEmail}...`);

        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
        const emailContent = generateOtpEmail({
            firstName: "Rahul",
            lastName: "Kumar",
            otpCode,
            appName: "MEEO Store",
        });

        const senderEmail = process.env.BREVO_SENDER_EMAIL || account.email;
        const senderName = process.env.BREVO_SENDER_NAME || "MEEO Store";

        const response = await client.transactionalEmails.sendTransacEmail({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: targetEmail }],
            subject: `[MEEO Brevo] Your Verification OTP: ${otpCode}`,
            htmlContent: emailContent.html,
            textContent: emailContent.text,
        });

        console.log("🎉 SUCCESS: Email delivered via Brevo API!");
        console.log("├─ Message ID:", response.messageId || (response as any).messageIds?.join(", "));
        console.log("├─ Sent To:", targetEmail);
        console.log("└─ OTP Code:", otpCode);
    } catch (err: any) {
        console.error("❌ Brevo API Error:", err.message);
        if (err.body) {
            console.error("Response Body:", err.body);
        }
    }
}

testBrevo();
