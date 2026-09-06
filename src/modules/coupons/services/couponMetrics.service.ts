import { prisma } from "@/lib/prisma.js";

export class CouponMetricsService {
    /**
     * Computes high-level analytics and performance metrics for all promotional coupons.
     */
    async getCouponMetrics() {
        const [total, active, inactive, expired, totalUsages, discountAggregate, topCoupons] = await Promise.all([
            prisma.coupon.count(),
            prisma.coupon.count({ where: { status: "ACTIVE" } }),
            prisma.coupon.count({ where: { status: "INACTIVE" } }),
            prisma.coupon.count({ where: { status: "EXPIRED" } }),
            prisma.couponUsage.count(),
            prisma.couponUsage.aggregate({
                _sum: { discountAmount: true },
                _avg: { discountAmount: true },
            }),
            prisma.coupon.findMany({
                take: 5,
                orderBy: {
                    usages: {
                        _count: "desc",
                    },
                },
                select: {
                    id: true,
                    code: true,
                    type: true,
                    value: true,
                    status: true,
                    _count: { select: { usages: true } },
                },
            }),
        ]);

        const totalDiscountGiven = Number(discountAggregate._sum.discountAmount ?? 0);
        const avgDiscountPerOrder = Number(discountAggregate._avg.discountAmount ?? 0);

        return {
            summary: {
                totalCoupons: total,
                activeCoupons: active,
                inactiveCoupons: inactive,
                expiredCoupons: expired,
                totalRedemptions: totalUsages,
                totalDiscountGiven: Number(totalDiscountGiven.toFixed(2)),
                averageDiscountPerOrder: Number(avgDiscountPerOrder.toFixed(2)),
            },
            topCoupons: topCoupons.map((c) => ({
                id: c.id,
                code: c.code,
                type: c.type,
                value: Number(c.value),
                status: c.status,
                redemptionCount: c._count.usages,
            })),
            generatedAt: new Date().toISOString(),
        };
    }
}

export const couponMetricsService = new CouponMetricsService();
