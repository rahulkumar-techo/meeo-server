import { prisma } from "@/lib/prisma.js";
import redis from "@/lib/redis.js";
import { UserEventType, UserInterestType } from "@/generated/prisma/enums.js";

// Weight mapping for interest calculation
const EVENT_INTEREST_WEIGHTS: Partial<Record<UserEventType, number>> = {
    [UserEventType.PRODUCT_VIEWED]: 1,
    [UserEventType.PRODUCT_SEARCHED]: 2,
    [UserEventType.CATEGORY_VIEWED]: 2,
    [UserEventType.WISHLIST_ADDED]: 3,
    [UserEventType.CART_ADDED]: 5,
    [UserEventType.CHECKOUT_STARTED]: 7,
    [UserEventType.ORDER_COMPLETED]: 10,
    [UserEventType.PAYMENT_SUCCESS]: 10,
};

const WATERMARK_KEY = "tracking:worker:watermark";

export class UserBehaviourAggregationService {
    /**
     * Processes a batch of raw user events into behaviour summaries and interest scores.
     */
    async processBatch(batchSize = 100): Promise<{ processedCount: number; affectedUsers: number }> {
        const lastWatermark = await this.getWatermark();

        // 1. Fetch next batch of events after watermark
        const events = await prisma.userEvent.findMany({
            where: {
                createdAt: { gt: lastWatermark },
                userId: { not: null },
            },
            orderBy: { createdAt: "asc" },
            take: batchSize,
        });

        if (events.length === 0) {
            return { processedCount: 0, affectedUsers: 0 };
        }

        // 2. Group events by user to minimize database writes
        const userEventsMap = new Map<string, typeof events>();
        for (const evt of events) {
            if (!evt.userId) continue;
            const existing = userEventsMap.get(evt.userId) || [];
            existing.push(evt);
            userEventsMap.set(evt.userId, existing);
        }

        // 3. Batch upsert behaviour summaries per user
        for (const [userId, userBatch] of userEventsMap.entries()) {
            await this.aggregateUserBatch(userId, userBatch);
        }

        // 4. Advance watermark to the latest processed timestamp
        const latestTimestamp = events[events.length - 1]?.createdAt ?? new Date();
        await this.setWatermark(latestTimestamp);

        return {
            processedCount: events.length,
            affectedUsers: userEventsMap.size,
        };
    }

    /**
     * Aggregates event counters and interest scores for a single user batch.
     */
    private async aggregateUserBatch(userId: string, events: Array<{
        event: UserEventType;
        entityType: string | null;
        entityId: string | null;
        createdAt: Date;
    }>) {
        if (events.length === 0) return;

        // Delta counters for UserBehaviorSummary
        let productViews = 0;
        let searches = 0;
        let categoryViews = 0;
        let wishlistAdds = 0;
        let wishlistRemoves = 0;
        let cartAdds = 0;
        let cartRemoves = 0;
        let checkoutStarted = 0;
        let paymentStarted = 0;
        let paymentFailed = 0;
        let paymentSuccess = 0;

        let lastProductViewAt: Date | undefined;
        let lastPurchaseAt: Date | undefined;
        let lastActiveAt: Date = events[0]?.createdAt ?? new Date();

        // Interest map: key = `${type}:${entityId}`
        const interestMap = new Map<string, {
            type: UserInterestType;
            entityId: string;
            scoreDelta: number;
            viewDelta: number;
            cartDelta: number;
            purchaseDelta: number;
            lastInteractionAt: Date;
        }>();

        for (const evt of events) {
            if (evt.createdAt > lastActiveAt) {
                lastActiveAt = evt.createdAt;
            }

            switch (evt.event) {
                case UserEventType.PRODUCT_VIEWED:
                    productViews++;
                    if (!lastProductViewAt || evt.createdAt > lastProductViewAt) lastProductViewAt = evt.createdAt;
                    break;
                case UserEventType.PRODUCT_SEARCHED:
                    searches++;
                    break;
                case UserEventType.CATEGORY_VIEWED:
                    categoryViews++;
                    break;
                case UserEventType.WISHLIST_ADDED:
                    wishlistAdds++;
                    break;
                case UserEventType.WISHLIST_REMOVED:
                    wishlistRemoves++;
                    break;
                case UserEventType.CART_ADDED:
                    cartAdds++;
                    break;
                case UserEventType.CART_REMOVED:
                    cartRemoves++;
                    break;
                case UserEventType.CHECKOUT_STARTED:
                    checkoutStarted++;
                    break;
                case UserEventType.PAYMENT_STARTED:
                    paymentStarted++;
                    break;
                case UserEventType.PAYMENT_FAILED:
                    paymentFailed++;
                    break;
                case UserEventType.PAYMENT_SUCCESS:
                case UserEventType.ORDER_COMPLETED:
                    paymentSuccess++;
                    if (!lastPurchaseAt || evt.createdAt > lastPurchaseAt) lastPurchaseAt = evt.createdAt;
                    break;
            }

            // Calculate entity interest if entity info is present
            const interestType = this.resolveInterestType(evt.entityType);
            if (interestType && evt.entityId) {
                const key = `${interestType}:${evt.entityId}`;
                const current = interestMap.get(key) || {
                    type: interestType,
                    entityId: evt.entityId,
                    scoreDelta: 0,
                    viewDelta: 0,
                    cartDelta: 0,
                    purchaseDelta: 0,
                    lastInteractionAt: evt.createdAt,
                };

                const weight = EVENT_INTEREST_WEIGHTS[evt.event] || 1;
                current.scoreDelta += weight;
                if (evt.event === UserEventType.PRODUCT_VIEWED || evt.event === UserEventType.CATEGORY_VIEWED) {
                    current.viewDelta += 1;
                }
                if (evt.event === UserEventType.CART_ADDED) {
                    current.cartDelta += 1;
                }
                if (evt.event === UserEventType.ORDER_COMPLETED || evt.event === UserEventType.PAYMENT_SUCCESS) {
                    current.purchaseDelta += 1;
                }
                if (evt.createdAt > current.lastInteractionAt) {
                    current.lastInteractionAt = evt.createdAt;
                }
                interestMap.set(key, current);
            }
        }

        // 1. Atomic Upsert for UserBehaviorSummary
        await prisma.userBehaviorSummary.upsert({
            where: { userId },
            create: {
                userId,
                productViews,
                searches,
                categoryViews,
                wishlistAdds,
                wishlistRemoves,
                cartAdds,
                cartRemoves,
                checkoutStarted,
                paymentStarted,
                paymentFailed,
                paymentSuccess,
                lastActiveAt,
                ...(lastProductViewAt ? { lastProductViewAt } : {}),
                ...(lastPurchaseAt ? { lastPurchaseAt } : {}),
            },
            update: {
                productViews: { increment: productViews },
                searches: { increment: searches },
                categoryViews: { increment: categoryViews },
                wishlistAdds: { increment: wishlistAdds },
                wishlistRemoves: { increment: wishlistRemoves },
                cartAdds: { increment: cartAdds },
                cartRemoves: { increment: cartRemoves },
                checkoutStarted: { increment: checkoutStarted },
                paymentStarted: { increment: paymentStarted },
                paymentFailed: { increment: paymentFailed },
                paymentSuccess: { increment: paymentSuccess },
                lastActiveAt,
                ...(lastProductViewAt ? { lastProductViewAt } : {}),
                ...(lastPurchaseAt ? { lastPurchaseAt } : {}),
            },
        });

        // 2. Upsert interests for user
        for (const interest of interestMap.values()) {
            await prisma.userInterest.upsert({
                where: {
                    userId_type_entityId: {
                        userId,
                        type: interest.type,
                        entityId: interest.entityId,
                    },
                },
                create: {
                    userId,
                    type: interest.type,
                    entityId: interest.entityId,
                    score: interest.scoreDelta,
                    viewCount: interest.viewDelta,
                    cartCount: interest.cartDelta,
                    purchaseCount: interest.purchaseDelta,
                    lastInteractionAt: interest.lastInteractionAt,
                },
                update: {
                    score: { increment: interest.scoreDelta },
                    viewCount: { increment: interest.viewDelta },
                    cartCount: { increment: interest.cartDelta },
                    purchaseCount: { increment: interest.purchaseDelta },
                    lastInteractionAt: interest.lastInteractionAt,
                },
            });
        }
    }

    /**
     * Maps raw entityType string to UserInterestType enum
     */
    private resolveInterestType(entityType?: string | null): UserInterestType | null {
        if (!entityType) return null;
        const normalized = entityType.toUpperCase();
        if (normalized === "PRODUCT") return UserInterestType.PRODUCT;
        if (normalized === "CATEGORY") return UserInterestType.CATEGORY;
        if (normalized === "BRAND") return UserInterestType.BRAND;
        return null;
    }

    /**
     * Purges raw user events older than retention period (e.g. 60 days)
     */
    async purgeOldEvents(retentionDays = 60): Promise<number> {
        const thresholdDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const result = await prisma.userEvent.deleteMany({
            where: {
                createdAt: { lt: thresholdDate },
            },
        });
        return result.count;
    }

    private async getWatermark(): Promise<Date> {
        try {
            if (redis.status === "ready" || redis.status === "connect") {
                const val = await redis.get(WATERMARK_KEY);
                if (val) return new Date(val);
            }
        } catch {}
        // Default to beginning of tracking
        return new Date(0);
    }

    private async setWatermark(timestamp: Date): Promise<void> {
        try {
            if (redis.status === "ready" || redis.status === "connect") {
                await redis.set(WATERMARK_KEY, timestamp.toISOString());
            }
        } catch {}
    }
}

export const userBehaviourAggregationService = new UserBehaviourAggregationService();
