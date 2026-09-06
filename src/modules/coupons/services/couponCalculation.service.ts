import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";

export interface CouponCalculationResult {
    isValid: boolean;
    coupon: {
        id: string;
        code: string;
        type: string;
        value: number;
        minimumOrderAmount?: number | null;
        maximumDiscountAmount?: number | null;
    };
    originalSubtotal: number;
    discountAmount: number;
    newSubtotal: number;
    isFreeShipping: boolean;
    message: string;
}

export class CouponCalculationService {
    /**
     * Validates a coupon code and calculates discount amount and free shipping benefits.
     */
    async validateAndCalculate(
        couponCode: string,
        subtotal: number,
        userId?: string,
    ): Promise<CouponCalculationResult> {
        const normalizedCode = couponCode.trim().toUpperCase();
        const now = new Date();

        const coupon = await prisma.coupon.findUnique({
            where: { code: normalizedCode },
            include: {
                _count: { select: { usages: true } },
            },
        });

        if (!coupon) {
            throw new AppError(`Coupon code "${normalizedCode}" not found`, 404);
        }

        if (coupon.status !== "ACTIVE") {
            throw new AppError(`Coupon code "${normalizedCode}" is currently inactive or expired`, 400);
        }

        if (coupon.startsAt && coupon.startsAt > now) {
            throw new AppError(`Coupon code "${normalizedCode}" is not active yet (starts at ${coupon.startsAt.toISOString()})`, 400);
        }

        if (coupon.expiresAt && coupon.expiresAt < now) {
            throw new AppError(`Coupon code "${normalizedCode}" expired on ${coupon.expiresAt.toISOString()}`, 400);
        }

        if (coupon.usageLimit && coupon._count.usages >= coupon.usageLimit) {
            throw new AppError(`Coupon code "${normalizedCode}" has reached its maximum global usage limit`, 400);
        }

        const minOrder = coupon.minimumOrderAmount ? Number(coupon.minimumOrderAmount) : null;
        if (minOrder !== null && subtotal < minOrder) {
            throw new AppError(
                `Coupon "${normalizedCode}" requires a minimum order subtotal of $${minOrder.toFixed(2)} (current subtotal: $${subtotal.toFixed(2)})`,
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
                    `You have reached the maximum allowed usage limit (${coupon.usageLimitPerUser}) for coupon "${normalizedCode}"`,
                    400,
                );
            }
        }

        let discountAmount = 0;
        let isFreeShipping = false;
        const couponValue = Number(coupon.value);
        const maxDiscount = coupon.maximumDiscountAmount ? Number(coupon.maximumDiscountAmount) : null;

        switch (coupon.type) {
            case "PERCENTAGE": {
                discountAmount = (subtotal * couponValue) / 100;
                if (maxDiscount !== null && discountAmount > maxDiscount) {
                    discountAmount = maxDiscount;
                }
                break;
            }
            case "FIXED_AMOUNT": {
                discountAmount = Math.min(couponValue, subtotal);
                break;
            }
            case "FREE_SHIPPING": {
                isFreeShipping = true;
                discountAmount = 0;
                break;
            }
        }

        const finalDiscount = Number(discountAmount.toFixed(2));
        const newSubtotal = Number(Math.max(0, subtotal - finalDiscount).toFixed(2));

        return {
            isValid: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                type: coupon.type,
                value: couponValue,
                minimumOrderAmount: minOrder,
                maximumDiscountAmount: maxDiscount,
            },
            originalSubtotal: Number(subtotal.toFixed(2)),
            discountAmount: finalDiscount,
            newSubtotal,
            isFreeShipping,
            message: isFreeShipping
                ? `Coupon "${normalizedCode}" applied: Free shipping granted!`
                : `Coupon "${normalizedCode}" applied: Saved $${finalDiscount.toFixed(2)}!`,
        };
    }
}

export const couponCalculationService = new CouponCalculationService();
