import { describe, it, expect, vi, beforeEach } from "vitest";
import { CouponCalculationService } from "@/modules/coupons/services/couponCalculation.service.js";
import { CouponService } from "@/modules/coupons/services/coupon.service.js";
import { CouponUsageService } from "@/modules/coupons/services/couponUsage.service.js";
import { CouponMetricsService } from "@/modules/coupons/services/couponMetrics.service.js";
import { prisma } from "@/lib/prisma.js";

vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        coupon: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        couponUsage: {
            create: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            aggregate: vi.fn(),
        },
    },
}));

describe("Coupons & Promotions Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("CouponCalculationService", () => {
        const calcService = new CouponCalculationService();

        it("calculates percentage discount correctly", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-1",
                code: "SAVE20",
                type: "PERCENTAGE",
                value: 20 as any,
                minimumOrderAmount: null,
                maximumDiscountAmount: null,
                usageLimit: null,
                usageLimitPerUser: null,
                startsAt: null,
                expiresAt: null,
                status: "ACTIVE",
                _count: { usages: 5 },
            } as any);

            const result = await calcService.validateAndCalculate("save20", 150);

            expect(result.isValid).toBe(true);
            expect(result.discountAmount).toBe(30); // 20% of 150
            expect(result.newSubtotal).toBe(120);
            expect(result.isFreeShipping).toBe(false);
        });

        it("enforces maximum discount amount cap on percentage coupons", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-2",
                code: "MEGA50",
                type: "PERCENTAGE",
                value: 50 as any,
                minimumOrderAmount: 100 as any,
                maximumDiscountAmount: 40 as any, // Capped at $40
                usageLimit: null,
                usageLimitPerUser: null,
                startsAt: null,
                expiresAt: null,
                status: "ACTIVE",
                _count: { usages: 2 },
            } as any);

            const result = await calcService.validateAndCalculate("MEGA50", 200);

            expect(result.discountAmount).toBe(40); // 50% of 200 = 100, but capped at 40
            expect(result.newSubtotal).toBe(160);
        });

        it("calculates fixed amount discount without exceeding subtotal", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-3",
                code: "FLAT25",
                type: "FIXED_AMOUNT",
                value: 25 as any,
                minimumOrderAmount: null,
                maximumDiscountAmount: null,
                usageLimit: null,
                usageLimitPerUser: null,
                startsAt: null,
                expiresAt: null,
                status: "ACTIVE",
                _count: { usages: 0 },
            } as any);

            const result1 = await calcService.validateAndCalculate("FLAT25", 100);
            expect(result1.discountAmount).toBe(25);
            expect(result1.newSubtotal).toBe(75);

            // If subtotal is less than discount, discount is capped at subtotal
            const result2 = await calcService.validateAndCalculate("FLAT25", 15);
            expect(result2.discountAmount).toBe(15);
            expect(result2.newSubtotal).toBe(0);
        });

        it("handles FREE_SHIPPING coupon properly", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-4",
                code: "FREESHIP",
                type: "FREE_SHIPPING",
                value: 0 as any,
                minimumOrderAmount: null,
                maximumDiscountAmount: null,
                usageLimit: null,
                usageLimitPerUser: null,
                startsAt: null,
                expiresAt: null,
                status: "ACTIVE",
                _count: { usages: 0 },
            } as any);

            const result = await calcService.validateAndCalculate("FREESHIP", 80);

            expect(result.isFreeShipping).toBe(true);
            expect(result.discountAmount).toBe(0);
            expect(result.newSubtotal).toBe(80);
        });

        it("rejects coupon if order subtotal is below minimumOrderAmount", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-5",
                code: "MIN100",
                type: "PERCENTAGE",
                value: 10 as any,
                minimumOrderAmount: 100 as any,
                status: "ACTIVE",
                _count: { usages: 0 },
            } as any);

            await expect(calcService.validateAndCalculate("MIN100", 75)).rejects.toThrow(
                /requires a minimum order subtotal of \$100\.00/,
            );
        });

        it("rejects expired coupon", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-6",
                code: "EXPIRED",
                type: "PERCENTAGE",
                value: 10 as any,
                expiresAt: new Date(Date.now() - 10000), // In past
                status: "ACTIVE",
                _count: { usages: 0 },
            } as any);

            await expect(calcService.validateAndCalculate("EXPIRED", 100)).rejects.toThrow(
                /expired on/,
            );
        });

        it("rejects coupon if global usageLimit is exhausted", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-7",
                code: "LIMITED",
                type: "PERCENTAGE",
                value: 10 as any,
                usageLimit: 10,
                status: "ACTIVE",
                _count: { usages: 10 }, // Maxed out
            } as any);

            await expect(calcService.validateAndCalculate("LIMITED", 100)).rejects.toThrow(
                /reached its maximum global usage limit/,
            );
        });

        it("rejects coupon if user has reached usageLimitPerUser", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-8",
                code: "USERLIMIT",
                type: "PERCENTAGE",
                value: 15 as any,
                usageLimitPerUser: 1,
                status: "ACTIVE",
                _count: { usages: 5 },
            } as any);

            vi.mocked(prisma.couponUsage.count).mockResolvedValue(1); // User already used 1 time

            await expect(calcService.validateAndCalculate("USERLIMIT", 100, "user-123")).rejects.toThrow(
                /maximum allowed usage limit \(1\)/,
            );
        });
    });

    describe("CouponService (CRUD)", () => {
        const couponService = new CouponService();

        it("creates coupon and normalizes code to uppercase", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.coupon.create).mockResolvedValue({
                id: "new-c",
                code: "DISCOUNT10",
                type: "PERCENTAGE",
                value: 10 as any,
                status: "ACTIVE",
            } as any);

            const result = await couponService.createCoupon({
                code: "discount10",
                type: "PERCENTAGE",
                value: 10,
            } as any);

            expect(result.code).toBe("DISCOUNT10");
            expect(prisma.coupon.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ code: "DISCOUNT10" }),
                }),
            );
        });

        it("throws 409 conflict when creating duplicate coupon code", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({ id: "exist-1" } as any);

            await expect(
                couponService.createCoupon({
                    code: "DUPLICATE",
                    type: "PERCENTAGE",
                    value: 10,
                } as any),
            ).rejects.toThrow(/already exists/);
        });

        it("archives coupon with usages instead of hard deleting", async () => {
            vi.mocked(prisma.coupon.findUnique).mockResolvedValue({
                id: "c-with-usages",
                _count: { usages: 3 },
            } as any);
            vi.mocked(prisma.coupon.update).mockResolvedValue({ id: "c-with-usages", status: "INACTIVE" } as any);

            const res = await couponService.deleteCoupon("c-with-usages");

            expect(res.deleted).toBe(false);
            expect(res.archived).toBe(true);
            expect(prisma.coupon.update).toHaveBeenCalledWith({
                where: { id: "c-with-usages" },
                data: { status: "INACTIVE" },
            });
        });
    });

    describe("CouponUsageService & Metrics", () => {
        const usageService = new CouponUsageService();
        const metricsService = new CouponMetricsService();

        it("records coupon usage in transaction", async () => {
            const mockTx = {
                couponUsage: {
                    create: vi.fn().mockResolvedValue({ id: "usage-1" }),
                },
            };

            await usageService.recordUsage(mockTx as any, "c-1", "ord-100", 25.5, "user-1");

            expect(mockTx.couponUsage.create).toHaveBeenCalledWith({
                data: {
                    couponId: "c-1",
                    orderId: "ord-100",
                    userId: "user-1",
                    discountAmount: 25.5,
                },
            });
        });

        it("computes promotion analytics and top redeemed coupons", async () => {
            vi.mocked(prisma.coupon.count)
                .mockResolvedValueOnce(10) // total
                .mockResolvedValueOnce(7)  // active
                .mockResolvedValueOnce(2)  // inactive
                .mockResolvedValueOnce(1); // expired

            vi.mocked(prisma.couponUsage.count).mockResolvedValue(150);
            vi.mocked(prisma.couponUsage.aggregate).mockResolvedValue({
                _sum: { discountAmount: 3750 as any },
                _avg: { discountAmount: 25 as any },
            } as any);

            vi.mocked(prisma.coupon.findMany).mockResolvedValue([
                { id: "c-1", code: "TOP1", type: "PERCENTAGE", value: 20 as any, status: "ACTIVE", _count: { usages: 80 } },
            ] as any);

            const metrics = await metricsService.getCouponMetrics();

            expect(metrics.summary.totalCoupons).toBe(10);
            expect(metrics.summary.activeCoupons).toBe(7);
            expect(metrics.summary.totalRedemptions).toBe(150);
            expect(metrics.summary.totalDiscountGiven).toBe(3750);
            expect(metrics.topCoupons).toHaveLength(1);
            expect(metrics.topCoupons[0]?.code).toBe("TOP1");
        });
    });
});
