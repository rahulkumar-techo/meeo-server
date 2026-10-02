import "dotenv/config";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { prisma } from "../src/lib/prisma.js";

const DEFAULT_LOGO_URL = process.env.NOTIFICATION_LOGO_URL || "https://ik.imagekit.io/ww7mydmoc/meeo-logo/Meeo2.png";

async function main() {
    console.log("=================================================");
    console.log("📢 SEED & TEST: PUSH NOTIFICATION BROADCAST");
    console.log("=================================================\n");

    // 1. Validate Firebase Credentials
    const rawProjectId = process.env.FIREBASE_PROJECT_ID;
    const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!rawProjectId || !rawClientEmail || !rawPrivateKey) {
        console.error("❌ Error: Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in .env");
        process.exit(1);
    }

    const projectId = rawProjectId.replace(/^["']|["']$/g, "").trim();
    const clientEmail = rawClientEmail.replace(/^["']|["']$/g, "").trim();
    const privateKey = rawPrivateKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();

    // 2. Initialize Firebase Admin SDK
    const app = getApps().length > 0 ? getApps()[0]! : initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
    });

    const messaging = getMessaging(app);
    console.log(`✅ Firebase Admin initialized for project: "${projectId}"\n`);

    // 3. Optional CLI Token input
    const cliToken = process.argv[2];

    // If CLI token is passed, allow seeding it into the database for testing
    if (cliToken && cliToken.length > 20) {
        console.log(`🔑 CLI token provided: ${cliToken.slice(0, 25)}...`);
        try {
            // Find first user to associate test token with
            const user = await prisma.user.findFirst({ select: { id: true, email: true } });
            if (user) {
                await prisma.deviceToken.upsert({
                    where: { token: cliToken },
                    update: { isActive: true, lastUsedAt: new Date() },
                    create: {
                        userId: user.id,
                        token: cliToken,
                        platform: "web",
                        userAgent: "Test Script Browser",
                        isActive: true,
                    },
                });
                console.log(`   - Saved/Updated token in database for user: ${user.email} (${user.id})\n`);
            }
        } catch (err: any) {
            console.log(`   - Note: Could not attach to DB user (${err.message}), continuing with direct broadcast.\n`);
        }
    }

    // 4. Query All Active Device Tokens from Database
    console.log("🔍 Fetching active devices from database...");
    let deviceRecords = await prisma.deviceToken.findMany({
        where: { isActive: true },
        select: {
            id: true,
            userId: true,
            token: true,
            platform: true,
            userAgent: true,
            lastUsedAt: true,
        },
    });

    // If CLI token was passed but not in DB, include it directly
    const tokensFromDb = deviceRecords.map((d) => d.token);
    const targetTokens = cliToken && !tokensFromDb.includes(cliToken) 
        ? [...tokensFromDb, cliToken] 
        : tokensFromDb;

    console.log(`📊 Found ${deviceRecords.length} active device token(s) in DB (Total targets: ${targetTokens.length}).\n`);
    console.table(deviceRecords.map(d => ({
        id: d.id,
        platform: d.platform,
        userAgent: (d.userAgent || "N/A").slice(0, 30),
        token: `${d.token.slice(0, 15)}...`,
        lastUsedAt: d.lastUsedAt,
    })));

    if (targetTokens.length === 0) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("⚠️  NO REGISTERED DEVICES FOUND IN DATABASE!");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("To test with your browser's FCM token, run:");
        console.log("   npx tsx scripts/seed-notify-all-devices.ts <YOUR_FCM_TOKEN>\n");
        console.log("Example:");
        console.log("   npx tsx scripts/seed-notify-all-devices.ts eKj9...sample_fcm_token...\n");
        process.exit(0);
    }

    // 5. Construct Multicast Push Message
    const title = "🔥 Exclusive Flash Alert - MEEO Store";
    const body = "Your Web & Mobile push notification pipeline is now active!";

    const message: MulticastMessage = {
        tokens: targetTokens,
        notification: {
            title,
            body,
            imageUrl: DEFAULT_LOGO_URL,
        },
        data: {
            type: "BROADCAST_TEST",
            clickAction: "/",
            timestamp: new Date().toISOString(),
        },
        webpush: {
            notification: {
                title,
                body,
                icon: DEFAULT_LOGO_URL,
                image: DEFAULT_LOGO_URL,
                badge: DEFAULT_LOGO_URL,
                requireInteraction: true,
            },
            fcmOptions: {
                link: "/",
            },
        },
        android: {
            priority: "high",
            notification: {
                sound: "default",
                channelId: "default",
                defaultSound: true,
                imageUrl: DEFAULT_LOGO_URL,
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
                imageUrl: DEFAULT_LOGO_URL,
            },
        },
    };

    // 6. Send Push Notification to All Devices
    console.log(`🚀 Dispatching push notification to ${targetTokens.length} device(s)...`);
    const response = await messaging.sendEachForMulticast(message);

    console.log("\n=================================================");
    console.log("📊 BROADCAST RESULTS SUMMARY");
    console.log("=================================================");
    console.log(`- Success Count: ${response.successCount}`);
    console.log(`- Failure Count: ${response.failureCount}`);
    console.log("-------------------------------------------------");

    const tokensToDeactivate: string[] = [];

    response.responses.forEach((res, index) => {
        const token = targetTokens[index];
        const preview = `${token.slice(0, 20)}...`;

        if (res.success) {
            console.log(`[Device #${index + 1}] ✅ SUCCESS | Token: ${preview} | MessageId: ${res.messageId}`);
        } else {
            const errCode = res.error?.code || "UNKNOWN";
            const errMsg = res.error?.message || "Unknown error";
            console.log(`[Device #${index + 1}] ❌ FAILED  | Token: ${preview} | Error: ${errCode} (${errMsg})`);

            // Mark dead/unregistered tokens for cleanup
            if (
                errCode === "messaging/registration-token-not-registered" ||
                errCode === "messaging/invalid-registration-token"
            ) {
                tokensToDeactivate.push(token);
            }
        }
    });

    // 7. Cleanup inactive/stale tokens in DB
    if (tokensToDeactivate.length > 0) {
        console.log(`\n🧹 Deleting ${tokensToDeactivate.length} expired/stale tokens from database...`);
        try {
            await prisma.deviceToken.deleteMany({
                where: { token: { in: tokensToDeactivate } },
            });
            console.log("   - Stale tokens deleted from DB.");
        } catch (err: any) {
            console.log(`   - Could not delete tokens: ${err.message}`);
        }
    }

    console.log("\n✅ Broadcast execution completed.\n");
}

main()
    .catch((err) => {
        console.error("❌ Fatal broadcast error:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
