import { describe, it, expect, vi, beforeEach } from "vitest";
import { promotionEngine } from "@/modules/promotions/services/promotionEngine.service.js";
import { PromotionService } from "@/modules/promotions/services/promotion.service.js";
import { PromotionUsageService } from "@/modules/promotions/services/promotionUsage.service.js";
import { prisma } from "@/lib/prisma.js";
import type { Promotion, PromotionCartItem } from "@/modules/promotions/types/promotion.types.js";

vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        promotion: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        promotionUsage: {
            create: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            aggregate: vi.fn(),
        },
        order: {
            count: vi.fn(),
        },
    },
}));

vi.mock("@/modules/promotions/services/promotionCache.service.js", () => ({
    promotionCacheService: {
        getActiveAutomaticPromotions: vi.fn().mockResolvedValue(null),
        setActiveAutomaticPromotions: vi.fn().mockResolvedValue(undefined),
        getPromotionByCode: vi.fn().mockResolvedValue(null),
        setPromotionByCode: vi.fn().mockResolvedValue(undefined),
        invalidateAll: vi.fn().mockResolvedValue(undefined),
        invalidateCode: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("@/modules/audit/services/auditLog.service.js", () => ({
    auditLogService: {
        recordLog: vi.fn().mockResolvedValue({}),
    },
}));

describe("Promotions Module Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const sampleItems: PromotionCartItem[] = [
        {
            productId: "p1",
            categoryId: "c1",
            brandId: "b1",
            productName: "Sneakers",
            unitPrice: 100,
            quantity: 2,
            lineTotal: 200,
        },
        {
            productId: "p2",
            categoryId: "c2",
            brandId: "b2",
            productName: "T-Shirt",
            unitPrice: 50,
            quantity: 1,
            lineTotal: 50,
        },
    ];

    const basePromo: Promotion = {
        id: "promo-1",
        name: "Base Promo",
        slug: "base-promo",
        description: null,
        code: null,
        type: "PERCENTAGE",
        status: "ACTIVE",
        priority: 0,
        isStackable: false,
        stackingRule: "EXCLUSIVE",
        isAutomatic: true,
        customerSegment: "ALL",
        firstOrderOnly: false,
        discountValue: 20 as any,
        maxDiscountAmount: null,
        minOrderSubtotal: null,
        minQuantity: null,
        buyXQuantity: null,
        getYQuantity: null,
        getYDiscountPercentage: null,
        startsAt: null,
        endsAt: null,
        timeOfDayStart: null,
        timeOfDayEnd: null,
        daysOfWeek: [],
        totalUsageLimit: null,
        userUsageLimit: null,
        currentUsageCount: 0,
        targetProductIds: [],
        targetCategoryIds: [],
        targetBrandIds: [],
        excludedProductIds: [],
        excludedCategoryIds: [],
        metadata: null,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    describe("PromotionEngine Evaluation", () => {
        it("calculates percentage discount with cap", () => {
            const promo: Promotion = {
                ...basePromo,
                name: "20% Off All",
                discountValue: 20 as any,
                maxDiscountAmount: 30 as any,
            };

            const result = promotionEngine.evaluate([promo], {
                subtotal: 250,
                shippingFee: 15,
                items: sampleItems,
            });

            expect(result.discountSubtotal).toBe(30);
            expect(result.grandTotal).toBe(235);
            expect(result.appliedPromotions).toHaveLength(1);
        });

        it("calculates Buy-2-Get-1 (B2G1) free promotion accurately", () => {
            const promo: Promotion = {
                ...basePromo,
                id: "promo-bogo",
                type: "BUY_X_GET_Y",
                isStackable: true,
                stackingRule: "STACKABLE_WITH_OTHERS",
                discountValue: null,
                buyXQuantity: 2,
                getYQuantity: 1,
                getYDiscountPercentage: 100 as any,
                targetProductIds: ["p1"],
            };

            const bogoItems: PromotionCartItem[] = [
                {
                    productId: "p1",
                    productName: "Sneakers",
                    unitPrice: 100,
                    quantity: 3,
                    lineTotal: 300,
                },
            ];

            const result = promotionEngine.evaluate([promo], {
                subtotal: 300,
                items: bogoItems,
            });

            expect(result.discountSubtotal).toBe(100);
            expect(result.grandTotal).toBe(200);
            expect(result.itemAllocations[0]?.discountAmount).toBe(100);
        });

        it("enforces flash sale time-of-day window", () => {
            const promo: Promotion = {
                ...basePromo,
                type: "FLASH_SALE",
                discountValue: 50 as any,
                timeOfDayStart: "14:00",
                timeOfDayEnd: "16:00",
            };

            // Inactive at 10:00 UTC
            const morningTime = new Date("2026-09-20T10:00:00Z");
            const morningResult = promotionEngine.evaluate([promo], {
                subtotal: 250,
                currentTime: morningTime,
                items: sampleItems,
            });
            expect(morningResult.appliedPromotions).toHaveLength(0);
            expect(morningResult.ineligiblePromotions).toHaveLength(1);

            // Active at 15:00 UTC
            const flashTime = new Date("2026-09-20T15:00:00Z");
            const flashResult = promotionEngine.evaluate([promo], {
                subtotal: 250,
                currentTime: flashTime,
                items: sampleItems,
            });
            expect(flashResult.appliedPromotions).toHaveLength(1);
            expect(flashResult.discountSubtotal).toBe(125);
        });

        it("resolves priority order and exclusive non-stacking rules", () => {
            const highPriorityExclusive: Promotion = {
                ...basePromo,
                id: "promo-high",
                name: "High Priority Exclusive 10%",
                priority: 100,
                discountValue: 10 as any,
                stackingRule: "EXCLUSIVE",
            };

            const lowPriorityStackable: Promotion = {
                ...basePromo,
                id: "promo-low",
                name: "Low Priority 50%",
                priority: 10,
                discountValue: 50 as any,
                isStackable: true,
                stackingRule: "STACKABLE_WITH_OTHERS",
            };

            const result = promotionEngine.evaluate([lowPriorityStackable, highPriorityExclusive], {
                subtotal: 250,
                items: sampleItems,
            });

            expect(result.appliedPromotions).toHaveLength(1);
            expect(result.appliedPromotions[0]?.id).toBe("promo-high");
            expect(result.discountSubtotal).toBe(25);
        });

        it("handles free shipping promotions", () => {
            const promo: Promotion = {
                ...basePromo,
                id: "promo-freeship",
                type: "FREE_SHIPPING",
                discountValue: null,
            };

            const result = promotionEngine.evaluate([promo], {
                subtotal: 100,
                shippingFee: 25,
                items: sampleItems,
            });

            expect(result.isFreeShipping).toBe(true);
            expect(result.shippingDiscount).toBe(25);
            expect(result.finalShippingFee).toBe(0);
            expect(result.grandTotal).toBe(100);
        });
    });

    describe("PromotionUsageService", () => {
        const usageService = new PromotionUsageService();

        it("validates per-user usage limits", async () => {
            vi.mocked(prisma.promotionUsage.count).mockResolvedValue(3);

            await expect(
                usageService.validateUserUsageLimit("p-1", "user-1", 2)
            ).rejects.toThrow("maximum usage limit");
        });

        it("retrieves user promotion redemption history", async () => {
            vi.mocked(prisma.promotionUsage.findMany).mockResolvedValue([
                {
                    id: "u-1",
                    promotionId: "p-1",
                    orderId: "o-1",
                    userId: "user-1",
                    discountAmount: 25 as any,
                    createdAt: new Date(),
                    promotion: { id: "p-1", name: "Summer 20", slug: "summer-20", code: "SUMMER20", type: "PERCENTAGE" },
                    order: { id: "o-1", orderNumber: "ORD-101", grandTotal: 150 as any, createdAt: new Date() },
                } as any,
            ]);
            vi.mocked(prisma.promotionUsage.count).mockResolvedValue(1);

            const result = await usageService.getUserPromotionHistory("user-1", { page: 1, limit: 10 });
            expect(result.usages).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
        });
    });

    describe("PromotionService", () => {
        const promoService = new PromotionService();

        it("prevents duplicate slugs on creation", async () => {
            vi.mocked(prisma.promotion.findUnique).mockResolvedValue({ id: "existing" } as any);

            await expect(
                promoService.createPromotion({
                    name: "Summer Sale",
                    slug: "summer-sale",
                    type: "PERCENTAGE",
                    status: "DRAFT",
                    priority: 0,
                    isStackable: false,
                    stackingRule: "EXCLUSIVE",
                    isAutomatic: false,
                    customerSegment: "ALL",
                    firstOrderOnly: false,
                    daysOfWeek: [],
                    targetProductIds: [],
                    targetCategoryIds: [],
                    targetBrandIds: [],
                    excludedProductIds: [],
                    excludedCategoryIds: [],
                })
            ).rejects.toThrow("already exists");
        });
    });
});
