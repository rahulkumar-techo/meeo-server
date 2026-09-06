import { prisma } from "@/lib/prisma.js";
import type { CouponUsageQueryInput } from "../validations/coupon.validation.js";

export class CouponUsageService {
    /**
     * Lists coupon usage history with pagination.
     */
    async listCouponUsages(query: CouponUsageQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.couponId) where.couponId = query.couponId;
        if (query.userId) where.userId = query.userId;

        const [items, total] = await Promise.all([
            prisma.couponUsage.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    coupon: {
                        select: { id: true, code: true, type: true, value: true },
                    },
                    order: {
                        select: { id: true, orderNumber: true, status: true, grandTotal: true },
                    },
                },
            }),
            prisma.couponUsage.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Lists all coupons redeemed by a specific user across their past orders.
     */
    async getUserCouponHistory(userId: string, query: { page?: number; limit?: number }) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.couponUsage.findMany({
                where: { userId },
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    coupon: {
                        select: { id: true, code: true, type: true, value: true },
                    },
                    order: {
                        select: { id: true, orderNumber: true, status: true, grandTotal: true, createdAt: true },
                    },
                },
            }),
            prisma.couponUsage.count({ where: { userId } }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Records a coupon usage inside an active database transaction.
     */
    async recordUsage(
        tx: any,
        couponId: string,
        orderId: string,
        discountAmount: number,
        userId?: string,
    ) {
        return tx.couponUsage.create({
            data: {
                couponId,
                orderId,
                userId: userId ?? null,
                discountAmount,
            },
        });
    }
}

export const couponUsageService = new CouponUsageService();
