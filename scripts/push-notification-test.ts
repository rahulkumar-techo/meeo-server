import "dotenv/config.js";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { prisma } from "../src/lib/prisma.js";

async function testPushNotifications() {
    console.log("==========================================");
    console.log("🚀 GOOGLE FIREBASE ADMIN FCM PUSH NOTIFICATION TEST");
    console.log("==========================================\n");

    const rawProjectId = process.env.FIREBASE_PROJECT_ID;
    const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log("1. Environment Variables Check:");
    console.log(`   - Project ID: ${rawProjectId ? `✅ Present (${rawProjectId.replace(/^["']|["']$/g, "").trim()})` : "❌ Missing"}`);
    console.log(`   - Client Email: ${rawClientEmail ? `✅ Present (${rawClientEmail.replace(/^["']|["']$/g, "").trim()})` : "❌ Missing"}`);
    console.log(`   - Private Key: ${rawPrivateKey ? "✅ Present" : "❌ Missing"}\n`);

    if (!rawProjectId || !rawClientEmail || !rawPrivateKey) {
        console.error("❌ Missing required Firebase credentials in .env file.");
        process.exit(1);
    }

    const projectId = rawProjectId.replace(/^["']|["']$/g, "").trim();
    const clientEmail = rawClientEmail.replace(/^["']|["']$/g, "").trim();
    const privateKey = rawPrivateKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();

    // Initialize Firebase Admin
    let app;
    if (getApps().length > 0) {
        app = getApps()[0]!;
    } else {
        app = initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }
    console.log(`2. ✅ Firebase Admin SDK initialized successfully for project "${projectId}".\n`);

    // Determine target device token (CLI arg or database lookup)
    let targetToken = process.argv[2];

    if (!targetToken) {
        console.log("3. Looking for active device tokens in database...");
        try {
            const activeDevice = await prisma.deviceToken.findFirst({
                where: { isActive: true },
                orderBy: { lastUsedAt: "desc" },
            });

            if (activeDevice?.token) {
                targetToken = activeDevice.token;
                console.log(`   - Found active device token for user: ${activeDevice.userId}`);
                console.log(`   - Platform: ${activeDevice.platform}`);
                console.log(`   - Token: ${targetToken.slice(0, 20)}...\n`);
            } else {
                console.log("   - ⚠️ No active device tokens found in database.\n");
            }
        } catch (err: any) {
            console.log(`   - ⚠️ Database query skipped/failed: ${err.message}\n`);
        }
    } else {
        console.log(`3. Using device token provided via CLI argument:\n   - Token: ${targetToken.slice(0, 20)}...\n`);
    }

    if (!targetToken) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("ℹ️ USAGE GUIDE:");
        console.log("   You can test a specific device FCM token directly by running:");
        console.log("   npx tsx scripts/push-notification-test.ts <YOUR_FCM_DEVICE_TOKEN>");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        console.log("Testing dry run message formatting validation...");
    }

    const logoImageUrl = process.argv[3] || process.env.NOTIFICATION_LOGO_URL || "https://ik.imagekit.io/ww7mydmoc/meeo-logo/Meeo2.png";
    console.log(`4. Notification ImageKit Logo: ${logoImageUrl}\n`);

    const messaging = getMessaging(app);

    const messagePayload: Message = {
        token: targetToken || "dummy-test-fcm-token-for-dry-run",
        notification: {
            title: "Order Update - MEEO Store",
            body: "Your order update push notification from Google Firebase Admin is working.",
            imageUrl: logoImageUrl,
        },
        data: {
            type: "TEST_NOTIFICATION",
            url: "/orders",
            imageUrl: logoImageUrl,
            timestamp: new Date().toISOString(),
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "default",
                defaultSound: true,
                defaultVibrateTimings: true,
                imageUrl: logoImageUrl,
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1,
                    "mutable-content": 1,
                },
            },
            fcmOptions: {
                imageUrl: logoImageUrl,
            },
        },
    };

    if (targetToken) {
        console.log("5. Sending live FCM push notification with ImageKit logo...");
        try {
            const messageId = await messaging.send(messagePayload);
            console.log("==========================================");
            console.log("SUCCESS: Push notification delivered with logo!");
            console.log(`   - Message ID: ${messageId}`);
            console.log(`   - Target Token: ${targetToken.slice(0, 25)}...`);
            console.log(`   - Logo URL: ${logoImageUrl}`);
            console.log("==========================================");
        } catch (err: any) {
            console.error("==========================================");
            console.error("❌ FCM SEND FAILED:");
            console.error(`   - Error Message: ${err.message}`);
            console.error(`   - Error Code: ${err.code || "N/A"}`);
            if (err.message.includes("not a valid FCM registration token") || err.code === "messaging/invalid-registration-token") {
                console.error("   - Reason: The device token provided is not a valid FCM token format.");
                console.error("   - Make sure your client app generates an FCM device token.");
            }
            console.error("==========================================");
        }
    } else {
        console.log("4. Validating message structure with Firebase Admin (Dry Run)...");
        try {
            const messageId = await messaging.send(messagePayload, true); // dryRun = true
            console.log("==========================================");
            console.log("✅ DRY RUN SUCCESS: Message payload validated by Firebase Admin!");
            console.log(`   - Response: ${messageId}`);
            console.log("==========================================");
        } catch (err: any) {
            if (err.code === "messaging/invalid-registration-token" || err.message.includes("registration token")) {
                console.log("==========================================");
                console.log("✅ Firebase Admin Connection & Auth Validated!");
                console.log("   (Dry run confirmed Firebase Admin API is connected and responding)");
                console.log("   To send to a real device, run:");
                console.log("   npx tsx scripts/push-notification-test.ts <YOUR_DEVICE_TOKEN>");
                console.log("==========================================");
            } else {
                console.error("❌ Dry run failed:", err.message);
            }
        }
    }

    try {
        await prisma.$disconnect();
    } catch {
        // ignore
    }
}

testPushNotifications().catch(console.error);
