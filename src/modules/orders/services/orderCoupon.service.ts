import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";

export interface CouponDiscountResult {
    coupon: any | null;
    discountAmount: number;
    isFreeShipping: boolean;
}

export class OrderCouponService {
    /**
     * Validates a coupon code against business constraints and calculates discount amount.
     */
    async validateAndCalculateDiscount(
        couponCode?: string,
        subtotal: number = 0,
        userId?: string,
    ): Promise<CouponDiscountResult> {
        if (!couponCode) {
            return { coupon: null, discountAmount: 0, isFreeShipping: false };
        }

        const normalizedCode = couponCode.trim().toUpperCase();
        const now = new Date();

        const coupon = await prisma.coupon.findUnique({
            where: { code: normalizedCode },
            include: {
                _count: { select: { usages: true } },
            },
        });

        if (!coupon || coupon.status !== "ACTIVE") {
            throw new AppError(`Coupon code "${normalizedCode}" is invalid or inactive`, 400);
        }

        if (coupon.startsAt && coupon.startsAt > now) {
            throw new AppError(`Coupon code "${normalizedCode}" is not yet active`, 400);
        }

        if (coupon.expiresAt && coupon.expiresAt < now) {
            throw new AppError(`Coupon code "${normalizedCode}" has expired`, 400);
        }

        if (coupon.usageLimit && coupon._count.usages >= coupon.usageLimit) {
            throw new AppError(`Coupon code "${normalizedCode}" has reached its maximum total usage limit`, 400);
        }

        if (coupon.minimumOrderAmount && subtotal < Number(coupon.minimumOrderAmount)) {
            throw new AppError(
                `Coupon code "${normalizedCode}" requires a minimum order subtotal of $${Number(coupon.minimumOrderAmount).toFixed(2)} (current subtotal: $${subtotal.toFixed(2)})`,
                400,
            );
        }

        if (userId && coupon.usageLimitPerUser) {
            const userUsagesCount = await prisma.couponUsage.count({
                where: {
                    couponId: coupon.id,
                    userId,
                },
            });

            if (userUsagesCount >= coupon.usageLimitPerUser) {
                throw new AppError(
                    `You have already used coupon code "${normalizedCode}" the maximum allowed number of times (${coupon.usageLimitPerUser})`,
                    400,
                );
            }
        }

        let discountAmount = 0;
        let isFreeShipping = false;
        const couponVal = Number(coupon.value);

        switch (coupon.type) {
            case "PERCENTAGE": {
                discountAmount = (subtotal * couponVal) / 100;
                if (coupon.maximumDiscountAmount) {
                    discountAmount = Math.min(discountAmount, Number(coupon.maximumDiscountAmount));
                }
                break;
            }
            case "FIXED_AMOUNT": {
                discountAmount = Math.min(couponVal, subtotal);
                break;
            }
            case "FREE_SHIPPING": {
                isFreeShipping = true;
                discountAmount = 0;
                break;
            }
        }

        return {
            coupon,
            discountAmount: Number(discountAmount.toFixed(2)),
            isFreeShipping,
        };
    }

    /**
     * Records coupon usage in the database within an active transaction.
     */
    async recordUsage(
        tx: any,
        couponId: string,
        orderId: string,
        discountAmount: number,
        userId?: string,
    ) {
        return await tx.couponUsage.create({
            data: {
                couponId,
                orderId,
                userId: userId ?? null,
                discountAmount,
            },
        });
    }
}

export const orderCouponService = new OrderCouponService();
