import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma.js";
import type { NotificationContent } from "../templates/notificationTemplates.js";

export interface SendPushOptions {
    userId: string;
    deviceToken?: string | undefined;
    content: NotificationContent;
}

export const DEFAULT_NOTIFICATION_IMAGE_URL = "https://ik.imagekit.io/ww7mydmoc/meeo-logo/Meeo2.png";

export class PushProvider {
    private firebaseApp: App | null = null;

    constructor() {
        this.initFirebase();
    }

    private initFirebase(): void {
        if (getApps().length > 0) {
            this.firebaseApp = getApps()[0] ?? null;
            return;
        }

        try {
            const rawProjectId = process.env.FIREBASE_PROJECT_ID;
            const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

            if (rawProjectId && rawClientEmail && rawPrivateKey) {
                const projectId = rawProjectId.replace(/^["']|["']$/g, "").trim();
                const clientEmail = rawClientEmail.replace(/^["']|["']$/g, "").trim();
                const privateKey = rawPrivateKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();

                this.firebaseApp = initializeApp({
                    credential: cert({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
                console.log(`[PushProvider] Firebase Admin initialized successfully for project "${projectId}".`);
                return;
            }

            // Google Cloud automatic credentials fallback if available
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                this.firebaseApp = initializeApp();
                console.log("[PushProvider] Firebase Admin initialized with GOOGLE_APPLICATION_CREDENTIALS.");
            }
        } catch (err: any) {
            console.warn("[PushProvider] Firebase Admin initialization skipped:", err.message);
        }
    }

    /**
     * Dispatches a mobile/web push notification directly using Google Firebase Admin SDK (FCM).
     */
    async sendPush(options: SendPushOptions): Promise<{ ticketId: string; success: boolean }> {
        const { userId, deviceToken, content } = options;

        if (!deviceToken) {
            console.log(`[PushProvider] Mock push sent for user ${userId}: "${content.pushTitle || content.title}"`);
            return {
                ticketId: `mock-push-${userId}-${Date.now()}`,
                success: true,
            };
        }

        // Send push via Google Firebase Admin Messaging (FCM)
        if (this.firebaseApp) {
            try {
                const messaging = getMessaging(this.firebaseApp);
                const imageUrl =
                    content.data?.imageUrl ||
                    content.data?.image ||
                    process.env.NOTIFICATION_LOGO_URL ||
                    DEFAULT_NOTIFICATION_IMAGE_URL;

                const message: Message = {
                    token: deviceToken,
                    notification: {
                        title: content.pushTitle || content.title,
                        body: content.pushBody || content.body,
                        ...(imageUrl ? { imageUrl } : {}),
                    },
                    android: {
                        priority: "high",
                        notification: {
                            sound: "default",
                            channelId: "default",
                            defaultSound: true,
                            ...(imageUrl ? { imageUrl } : {}),
                        },
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: "default",
                                badge: 1,
                                ...(imageUrl ? { "mutable-content": 1 } : {}),
                            },
                        },
                        fcmOptions: {
                            ...(imageUrl ? { imageUrl } : {}),
                        },
                    },
                    webpush: {
                        notification: {
                            title: content.pushTitle || content.title,
                            body: content.pushBody || content.body,
                            ...(imageUrl ? { image: imageUrl, icon: imageUrl } : {}),
                        },
                    },
                };

                if (content.data && Object.keys(content.data).length > 0) {
                    message.data = Object.fromEntries(
                        Object.entries(content.data).map(([k, v]) => [k, String(v)]),
                    );
                }

                const messageId = await messaging.send(message);
                console.log(`[PushProvider] Google Admin FCM push notification sent to ${userId} | Message ID: ${messageId}`);
                return { ticketId: messageId, success: true };
            } catch (err: any) {
                const errorMsg = String(err?.message || "");
                const errorCode = String(err?.code || "");
                const isInvalidToken =
                    errorMsg.includes("not a valid FCM registration token") ||
                    errorMsg.includes("registration-token-not-registered") ||
                    errorMsg.includes("invalid-registration-token") ||
                    errorCode.includes("invalid-registration-token") ||
                    errorCode.includes("registration-token-not-registered");

                if (isInvalidToken) {
                    console.warn(`[PushProvider] ⚠️ Deactivating stale/invalid FCM device token in DB: ${deviceToken.slice(0, 20)}...`);
                    try {
                        await prisma.deviceToken.updateMany({
                            where: { token: deviceToken },
                            data: { isActive: false },
                        });
                    } catch {
                        // ignore db errors
                    }
                }

                console.error(`[PushProvider] Google Admin FCM send failed for user ${userId}:`, err.message);
                throw err;
            }
        }

        console.log(
            `[PushProvider] Google Admin Push simulated for user ${userId} [Token: ${deviceToken.slice(0, 15)}...]: "${content.pushTitle || content.title}"`,
        );

        return {
            ticketId: `fcm-sim-${userId}-${Date.now()}`,
            success: true,
        };
    }
}

export const pushProvider = new PushProvider();
