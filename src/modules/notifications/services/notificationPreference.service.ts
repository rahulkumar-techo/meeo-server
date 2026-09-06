import { prisma } from "@/lib/prisma.js";
import type { UpdateNotificationPreferencesInput } from "../validations/notification.validation.js";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
    emailEnabled: true,
    pushEnabled: true,
    inAppEnabled: true,
    orderUpdates: true,
    promotions: true,
    securityAlerts: true,
    lowStockAlerts: true,
};

export class NotificationPreferenceService {
    /**
     * Gets user notification preferences, returning defaults if not yet created.
     */
    async getUserPreferences(userId: string) {
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
    }

    /**
     * Updates or creates user notification preferences.
     */
    async updateUserPreferences(userId: string, input: UpdateNotificationPreferencesInput) {
        const updateData: any = {};
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) {
                updateData[key] = value;
            }
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
     * Checks if a notification should be delivered based on user channel and category settings.
     */
    async isNotificationAllowed(
        userId: string | undefined,
        channel: "EMAIL" | "PUSH" | "IN_APP",
        category?: "orderUpdates" | "promotions" | "securityAlerts" | "lowStockAlerts",
    ): Promise<boolean> {
        if (!userId) {
            // If anonymous/no userId (e.g., guest checkout email), default to true for transactional channels
            return true;
        }

        const prefs = await this.getUserPreferences(userId);

        // 1. Channel check
        if (channel === "EMAIL" && !prefs.emailEnabled) return false;
        if (channel === "PUSH" && !prefs.pushEnabled) return false;
        if (channel === "IN_APP" && !prefs.inAppEnabled) return false;

        // 2. Category check
        if (category && (prefs as any)[category] === false) {
            return false;
        }

        return true;
    }
}

export const notificationPreferenceService = new NotificationPreferenceService();
