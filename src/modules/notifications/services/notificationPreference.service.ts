import { prisma } from "@/lib/prisma.js";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: false,
    orderUpdates: true,
    promotions: false,
    securityAlerts: true,
    lowStockAlerts: true,
};

export class NotificationPreferenceService {
    /**
     * Gets user notification preferences, returning defaults if not yet created.
     */
    async getUserPreferences(userId: string) {
        if (!prisma.notificationPreference?.findUnique) {
            return {
                userId,
                ...DEFAULT_NOTIFICATION_PREFERENCES,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        try {
            const prefs = await prisma.notificationPreference.findUnique({
                where: { userId },
            });

            if (!prefs) {
                return {
                    userId,
                    ...DEFAULT_NOTIFICATION_PREFERENCES,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            }

            return prefs;
        } catch {
            return {
                userId,
                ...DEFAULT_NOTIFICATION_PREFERENCES,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
    }

    /**
     * Updates or creates user notification preferences.
     */
    async updateUserPreferences(userId: string, input: Record<string, any>) {
        const updateData: any = {};
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) {
                updateData[key] = value;
            }
        }

        if (!prisma.notificationPreference?.upsert) {
            return {
                userId,
                ...DEFAULT_NOTIFICATION_PREFERENCES,
                ...updateData,
            };
        }

        return prisma.notificationPreference.upsert({
            where: { userId },
            create: {
                userId,
                ...DEFAULT_NOTIFICATION_PREFERENCES,
                ...updateData,
            },
            update: updateData,
        });
    }

    /**
     * Checks if a notification should be delivered based on customer channel (Push & Email) and category settings.
     * Note: In-App notifications are not delivered for customer scenarios.
     */
    async isNotificationAllowed(
        userId: string | undefined,
        channel: "EMAIL" | "PUSH" | "IN_APP",
        category?: string,
    ): Promise<boolean> {
        if (!userId) {
            return channel !== "IN_APP";
        }

        // Rule: no in-app notifications for customer notifications
        if (channel === "IN_APP") {
            return false;
        }

        const prefs = await this.getUserPreferences(userId);

        // 1. Channel check
        if (channel === "EMAIL" && !prefs.emailEnabled) return false;
        if (channel === "PUSH" && !prefs.pushEnabled) return false;

        // 2. Category check
        if (category) {
            if (
                (category === "order" ||
                    category === "orderUpdates" ||
                    category === "delivery" ||
                    category === "payment" ||
                    category === "returnRefund") &&
                prefs.orderUpdates === false
            ) {
                return false;
            }

            if (
                (category === "security" || category === "securityAlerts") &&
                prefs.securityAlerts === false
            ) {
                return false;
            }

            if (category === "promotions" && prefs.promotions === false) {
                return false;
            }

            if ((prefs as any)[category] === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * Registers or updates an active FCM device push token for a user.
     */
    async registerDeviceToken(userId: string, input: { token: string; platform?: string | undefined; userAgent?: string | undefined }) {
        const { token, platform = "web", userAgent } = input;

        return prisma.deviceToken.upsert({
            where: { token },
            create: {
                userId,
                token,
                platform,
                userAgent: userAgent ?? null,
                isActive: true,
                lastUsedAt: new Date(),
            },
            update: {
                userId,
                platform,
                userAgent: userAgent ?? null,
                isActive: true,
                lastUsedAt: new Date(),
            },
        });
    }

    /**
     * Unregisters/removes a device push token for a user.
     */
    async unregisterDeviceToken(userId: string, token: string) {
        return prisma.deviceToken.deleteMany({
            where: { userId, token },
        });
    }

    /**
     * Retrieves all active device tokens for a user.
     */
    async getUserDeviceTokens(userId: string) {
        return prisma.deviceToken.findMany({
            where: { userId, isActive: true },
            orderBy: { lastUsedAt: "desc" },
        });
    }
}

export const notificationPreferenceService = new NotificationPreferenceService();
