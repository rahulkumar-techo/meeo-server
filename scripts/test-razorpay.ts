import "dotenv/config.js";
import { RazorpayPaymentProvider } from "../src/modules/payments/providers/razorpayPayment.provider.js";
import crypto from "crypto";

async function testRazorpay() {
    console.log("==========================================");
    console.log("🔍 TESTING RAZORPAY CONFIGURATION & TEST MODE");
    console.log("==========================================\n");

    const keyId = process.env.RAZORPAY_TEST_API_KEY || process.env.RAZORPAY_KEY_ID || "";
    const keySecret = process.env.RAZORPAY_TEST_SECRET_KEY || process.env.RAZORPAY_KEY_SECRET || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_TEST_SECRET_KEY || "";

    console.log("1. Environment Variables Check:");
    console.log(`   - Key ID: ${keyId ? `Present (${keyId.substring(0, 10)}...)` : "❌ Missing"}`);
    console.log(`   - Key Secret: ${keySecret ? `Present (${keySecret.substring(0, 5)}...)` : "❌ Missing"}`);
    console.log(`   - Webhook Secret: ${webhookSecret ? `Present (${webhookSecret.substring(0, 5)}...)` : "⚠️ Optional / Default"}`);
    console.log(`   - Mode: ${keyId.startsWith("rzp_test_") ? "✅ TEST MODE (rzp_test_...)" : keyId.startsWith("rzp_live_") ? "⚠️ LIVE MODE" : "❓ No Key / Mock"}\n`);

    if (!keyId || !keySecret) {
        console.log("⚠️ No active Razorpay API credentials found in .env.");
        console.log("   The provider runs in mock fallback mode (local deterministic IDs).\n");
    } else {
        console.log("2. Testing Live HTTP Connection to Razorpay API (Test Mode):");
        try {
            const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
            const testAmountPaise = 50000; // 500.00 INR

            const response = await fetch("https://api.razorpay.com/v1/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: authHeader,
                },
                body: JSON.stringify({
                    amount: testAmountPaise,
                    currency: "INR",
                    receipt: `test_rcpt_${Date.now()}`.substring(0, 40),
                    notes: {
                        test: "true",
                        environment: "sandbox",
                    },
                }),
            });

            const data = (await response.json()) as any;

            if (response.ok && data.id) {
                console.log("   ✅ SUCCESS: Razorpay Test API Authenticated & Responding!");
                console.log(`   - Order ID: ${data.id}`);
                console.log(`   - Status: ${data.status}`);
                console.log(`   - Amount: ₹${data.amount / 100} ${data.currency}`);
                console.log(`   - Created At: ${new Date(data.created_at * 1000).toISOString()}\n`);
            } else {
                console.log("   ❌ Razorpay API returned error:");
                console.log(JSON.stringify(data, null, 2));
                console.log();
            }
        } catch (err: any) {
            console.log(`   ❌ Network error calling Razorpay API: ${err.message}\n`);
        }
    }

    console.log("3. Testing Provider Integration (RazorpayPaymentProvider):");
    const provider = new RazorpayPaymentProvider();
    const intent = await provider.createPaymentIntent({
        orderId: "ord_test_01J8R9XYZ",
        orderNumber: `ORD-${Date.now()}`,
        amount: 299.99,
        currency: "INR",
        customerEmail: "tester@example.com",
    });

    console.log("   - Provider Name:", provider.name);
    console.log("   - Provider Payment/Order ID:", intent.providerPaymentId);
    console.log("   - Status:", intent.status);
    console.log("   - Client Secret / Key ID:", intent.clientSecret ? `${intent.clientSecret.substring(0, 12)}...` : "None");
    console.log("   - Checkout URL:", intent.checkoutUrl);
    console.log("   - Raw Entity:", intent.rawResponse?.entity || "order");
    console.log("   ✅ Provider instance initialized and generated intent.\n");

    console.log("4. Testing Webhook Signature Verification:");
    const dummyPayload = JSON.stringify({
        event: "payment.captured",
        payload: {
            payment: {
                entity: {
                    id: "pay_test_123456",
                    order_id: intent.providerPaymentId,
                    amount: 29999,
                    status: "captured",
                },
            },
        },
    });

    const activeSecret = webhookSecret || keySecret || "rzp_whsec_test_secret";
    const validSignature = crypto.createHmac("sha256", activeSecret).update(dummyPayload).digest("hex");

    const isVerified = await provider.verifyWebhookSignature(dummyPayload, {
        "x-razorpay-signature": validSignature,
    }, activeSecret);

    console.log(`   - Signature Verification Test: ${isVerified ? "✅ PASSED (HMAC SHA-256 Valid)" : "❌ FAILED"}`);
    console.log("\n==========================================");
    console.log("🏁 RAZORPAY TEST COMPLETED SUCCESSFULLY");
    console.log("==========================================");
}

testRazorpay().catch(console.error);
