import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class PromotionUsageService {
    /**
     * Checks if a user has exceeded their specific per-user limit for a promotion.
     */
    async validateUserUsageLimit(promotionId: string, userId: string, limit?: number | null): Promise<void> {
        if (!limit || limit <= 0) return;

        const count = await prisma.promotionUsage.count({
            where: {
                promotionId,
                userId,
            },
        });

        if (count >= limit) {
            throw new AppError(`You have already reached the maximum usage limit (${limit}) for this promotion`, 400);
        }
    }

    /**
     * Atomically records a promotion usage and increments global usage counter in a transaction.
     */
    async recordUsage(
        tx: any,
        promotionId: string,
        orderId: string,
        discountAmount: number,
        userId?: string | null
    ) {
        const promo = await tx.promotion.findUnique({
            where: { id: promotionId },
            select: { id: true, totalUsageLimit: true, currentUsageCount: true, userUsageLimit: true },
        });

        if (!promo) {
            throw new AppError("Promotion not found during usage recording", 404);
        }

        if (promo.totalUsageLimit !== null && promo.totalUsageLimit !== undefined && promo.currentUsageCount >= promo.totalUsageLimit) {
            throw new AppError("Promotion has reached its global usage limit", 400);
        }

        if (userId && promo.userUsageLimit) {
            const userCount = await tx.promotionUsage.count({
                where: { promotionId, userId },
            });
            if (userCount >= promo.userUsageLimit) {
                throw new AppError(`User limit reached (${promo.userUsageLimit}) for this promotion`, 400);
            }
        }

        await tx.promotion.update({
            where: { id: promotionId },
            data: {
                currentUsageCount: { increment: 1 },
            },
        });

        return await tx.promotionUsage.create({
            data: {
                promotionId,
                orderId,
                userId: userId ?? null,
                discountAmount,
            },
        });
    }

    /**
     * Retrieves paginated redemption history for a specific user.
     */
    async getUserPromotionHistory(userId: string, query: { page?: number; limit?: number }) {
        const page = Math.max(1, query.page ?? 1);
        const limit = Math.min(100, Math.max(1, query.limit ?? 20));
        const skip = (page - 1) * limit;

        const [usages, total] = await Promise.all([
            prisma.promotionUsage.findMany({
                where: { userId },
                include: {
                    promotion: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            code: true,
                            type: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                            orderNumber: true,
                            grandTotal: true,
                            createdAt: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.promotionUsage.count({ where: { userId } }),
        ]);

        return {
            usages,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Computes usage statistics and analytics for a promotion.
     */
    async getPromotionUsageStats(promotionId: string) {
        const [totalCount, aggregates, recentUsages] = await Promise.all([
            prisma.promotionUsage.count({ where: { promotionId } }),
            prisma.promotionUsage.aggregate({
                where: { promotionId },
                _sum: { discountAmount: true },
                _avg: { discountAmount: true },
            }),
            prisma.promotionUsage.findMany({
                where: { promotionId },
                take: 10,
                orderBy: { createdAt: "desc" },
                include: {
                    order: { select: { orderNumber: true, grandTotal: true } },
                    user: { select: { id: true, email: true, firstName: true, lastName: true } },
                },
            }),
        ]);

        return {
            totalRedemptions: totalCount,
            totalDiscountGiven: Number((aggregates._sum.discountAmount ?? 0).toString()),
            averageDiscount: Number((aggregates._avg.discountAmount ?? 0).toString()),
            recentUsages,
        };
    }
}

export const promotionUsageService = new PromotionUsageService();
