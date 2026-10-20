import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        $queryRaw: vi.fn(),
        order: {
            findMany: vi.fn(),
            groupBy: vi.fn(),
            count: vi.fn(),
        },
        user: {
            count: vi.fn(),
            groupBy: vi.fn(),
        },
        paymentAttempt: {
            findMany: vi.fn(),
            groupBy: vi.fn(),
            count: vi.fn(),
        },
        refund: {
            aggregate: vi.fn(),
        },
        inventory: {
            findMany: vi.fn(),
            aggregate: vi.fn(),
            count: vi.fn(),
        },
        orderItem: {
            findMany: vi.fn(),
            groupBy: vi.fn(),
        },
        product: {
            findMany: vi.fn(),
        },
        review: {
            count: vi.fn(),
            groupBy: vi.fn(),
            aggregate: vi.fn(),
        },
        reviewReport: {
            count: vi.fn(),
        },
        coupon: {
            count: vi.fn(),
        },
        outboxEvent: {
            count: vi.fn(),
        },
    },
}));

vi.mock("@/lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

import { dashboardService } from "../modules/dashboard/services/dashboard.service.js";

describe("DashboardService Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getExecutiveOverview", () => {
        it("calculates KPIs correctly with orders, revenue, refunds, users, inventory, payments, reviews, and coupons", async () => {
            // Mock order grouping
            prismaMock.order.groupBy.mockResolvedValue([
                {
                    status: "CONFIRMED",
                    _count: { id: 1 },
                    _sum: { grandTotal: 1000, discountTotal: 50 },
                },
                {
                    status: "DELIVERED",
                    _count: { id: 1 },
                    _sum: { grandTotal: 2500, discountTotal: 100 },
                },
                {
                    status: "CANCELLED",
                    _count: { id: 1 },
                    _sum: { grandTotal: 500, discountTotal: 0 },
                },
            ]);

            // Mock refunds aggregate
            prismaMock.refund.aggregate.mockResolvedValue({
                _sum: { amount: 200 },
            });

            // Mock user status groups & new users count
            prismaMock.user.groupBy.mockResolvedValue([
                { status: "ACTIVE", _count: { _all: 450 } },
                { status: "SUSPENDED", _count: { _all: 30 } },
                { status: "BLOCKED", _count: { _all: 20 } },
            ]);
            prismaMock.user.count.mockResolvedValue(25);

            // Mock inventory stats and payment attempts SQL raw queries
            prismaMock.$queryRaw
                .mockResolvedValueOnce([
                    {
                        totalTrackedVariants: 3,
                        totalPhysicalUnits: 55,
                        totalReservedUnits: 12,
                        lowStockCount: 1,
                        outOfStockCount: 1,
                        inStockCount: 2,
                    },
                ])
                .mockResolvedValueOnce([
                    { status: "SUCCESS", provider: "STRIPE", count: 1 },
                    { status: "FAILED", provider: "RAZORPAY", count: 1 },
                ]);

            // Mock review groups & rating
            prismaMock.review.groupBy.mockResolvedValue([
                { status: "APPROVED", _count: { id: 70 } },
                { status: "PENDING", _count: { id: 5 } },
                { status: "REJECTED", _count: { id: 5 } },
            ]);
            prismaMock.review.aggregate.mockResolvedValue({
                _avg: { rating: 4.6 },
            });

            // Mock pending reports & active coupons
            prismaMock.reviewReport.count.mockResolvedValue(2);
            prismaMock.coupon.count.mockResolvedValue(12);

            const result = await dashboardService.getExecutiveOverview({ period: "30d" });

            expect(result.period).toBe("30d");
            expect(result.orders.totalOrders).toBe(3);
            expect(result.orders.successfulOrders).toBe(2);
            expect(result.orders.statusBreakdown.CONFIRMED).toBe(1);
            expect(result.orders.statusBreakdown.DELIVERED).toBe(1);
            expect(result.orders.statusBreakdown.CANCELLED).toBe(1);

            expect(result.revenue.grossRevenue).toBe(3500);
            expect(result.revenue.totalRefunds).toBe(200);
            expect(result.revenue.netRevenue).toBe(3300);
            expect(result.revenue.totalDiscountGranted).toBe(150);
            expect(result.revenue.averageOrderValue).toBe(1750);

            expect(result.users.totalUsers).toBe(500);
            expect(result.users.activeUsers).toBe(450);
            expect(result.users.suspendedUsers).toBe(30);
            expect(result.users.blockedUsers).toBe(20);
            expect(result.users.newUsersInPeriod).toBe(25);

            expect(result.inventory.totalTrackedVariants).toBe(3);
            expect(result.inventory.totalPhysicalUnits).toBe(55);
            expect(result.inventory.totalReservedUnits).toBe(12);
            expect(result.inventory.lowStockCount).toBe(1);
            expect(result.inventory.outOfStockCount).toBe(1);

            expect(result.payments.totalAttempts).toBe(2);
            expect(result.payments.successfulPayments).toBe(1);
            expect(result.payments.failedPayments).toBe(1);
            expect(result.payments.failureRate).toBe(50);
            expect(result.payments.gatewayBreakdown).toEqual({ STRIPE: 1, RAZORPAY: 1 });

            expect(result.reviews.totalReviews).toBe(80);
            expect(result.reviews.pendingModeration).toBe(5);
            expect(result.reviews.pendingAbuseReports).toBe(2);
            expect(result.reviews.averagePlatformRating).toBe(4.6);
            expect(result.promotions.activeCouponsCount).toBe(12);
        });

        it("handles empty database safely without NaN or zero division crashes", async () => {
            prismaMock.order.groupBy.mockResolvedValue([]);
            prismaMock.refund.aggregate.mockResolvedValue({ _sum: { amount: null } });
            prismaMock.user.groupBy.mockResolvedValue([]);
            prismaMock.user.count.mockResolvedValue(0);
            prismaMock.$queryRaw
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);
            prismaMock.review.groupBy.mockResolvedValue([]);
            prismaMock.review.aggregate.mockResolvedValue({ _avg: { rating: null } });
            prismaMock.reviewReport.count.mockResolvedValue(0);
            prismaMock.coupon.count.mockResolvedValue(0);

            const result = await dashboardService.getExecutiveOverview({ period: "today" });

            expect(result.orders.totalOrders).toBe(0);
            expect(result.revenue.grossRevenue).toBe(0);
            expect(result.revenue.netRevenue).toBe(0);
            expect(result.revenue.averageOrderValue).toBe(0);
            expect(result.payments.failureRate).toBe(0);
        });
    });

    describe("getSalesAndRevenueChart", () => {
        it("buckets paid orders into time-series data accurately", async () => {
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);

            prismaMock.order.findMany.mockResolvedValue([
                {
                    grandTotal: 1000,
                    createdAt: now,
                },
                {
                    grandTotal: 2500,
                    createdAt: now,
                },
            ]);

            const result = await dashboardService.getSalesAndRevenueChart({
                period: "7d",
                interval: "day",
            });

            expect(result.period).toBe("7d");
            expect(result.interval).toBe("day");
            expect(result.dataPoints.length).toBeGreaterThan(0);

            const point = result.dataPoints.find((s) => s.date === dateStr);
            expect(point).toBeDefined();
            expect(point?.revenue).toBe(3500);
            expect(point?.orderCount).toBe(2);
        });
    });

    describe("getTopSellingProducts", () => {
        it("returns ranked top-selling products by units sold", async () => {
            prismaMock.orderItem.groupBy.mockResolvedValue([
                { productId: "prod-1", _sum: { quantity: 10, total: 20000 } },
                { productId: "prod-2", _sum: { quantity: 5, total: 15000 } },
            ]);
            prismaMock.product.findMany.mockResolvedValue([
                {
                    id: "prod-1",
                    name: "Premium Wireless Earbuds",
                    slug: "premium-wireless-earbuds",
                    images: [{ url: "https://ik.imagekit.io/v1.jpg" }],
                },
                {
                    id: "prod-2",
                    name: "Smart Fitness Watch",
                    slug: "smart-fitness-watch",
                    images: [],
                },
            ]);

            const result = await dashboardService.getTopSellingProducts({
                period: "30d",
                limit: 5,
            });

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                productId: "prod-1",
                name: "Premium Wireless Earbuds",
                slug: "premium-wireless-earbuds",
                thumbnail: "https://ik.imagekit.io/v1.jpg",
                unitsSold: 10,
                totalRevenue: 20000,
            });
        });
    });

    describe("getLowStockAlerts", () => {
        it("returns low stock inventory records below the given threshold", async () => {
            prismaMock.inventory.count.mockResolvedValue(1);
            prismaMock.inventory.findMany.mockResolvedValue([
                {
                    id: "inv-1",
                    variantId: "var-1",
                    availableQuantity: 3,
                    reservedQuantity: 2,
                    reorderLevel: 10,
                    variant: {
                        id: "var-1",
                        sku: "SKU-RED-M",
                        price: 1500,
                        product: {
                            id: "prod-1",
                            name: "Organic Cotton T-Shirt",
                            slug: "organic-cotton-t-shirt",
                        },
                    },
                },
            ]);

            const result = await dashboardService.getLowStockAlerts({
                threshold: 10,
                page: 1,
                limit: 20,
            });

            expect(result.pagination.total).toBe(1);
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toEqual({
                inventoryId: "inv-1",
                variantId: "var-1",
                sku: "SKU-RED-M",
                productName: "Organic Cotton T-Shirt",
                productId: "prod-1",
                productSlug: "organic-cotton-t-shirt",
                price: 1500,
                availableQuantity: 3,
                reservedQuantity: 2,
                reorderLevel: 10,
                isOutOfStock: false,
            });
        });
    });

    describe("getRecentFailedPayments", () => {
        it("returns list of failed payments with error reason and gateway diagnostics", async () => {
            prismaMock.paymentAttempt.count.mockResolvedValue(1);
            prismaMock.paymentAttempt.findMany.mockResolvedValue([
                {
                    id: "att-fail-1",
                    paymentId: "pay-1",
                    attemptNumber: 1,
                    amount: 4500,
                    failureCode: "BAD_REQUEST_ERROR",
                    failureMessage: "Payment declined due to invalid card number",
                    initiatedAt: new Date("2026-09-06T12:00:00Z"),
                    payment: {
                        provider: "RAZORPAY",
                        currency: "INR",
                        orderId: "ord-1",
                        order: {
                            id: "ord-1",
                            orderNumber: "ORD-2026-001",
                            grandTotal: 4500,
                            user: {
                                id: "usr-1",
                                email: "customer@example.com",
                                firstName: "John",
                                lastName: "Doe",
                            },
                        },
                    },
                },
            ]);

            const result = await dashboardService.getRecentFailedPayments({ limit: 10, page: 1 });

            expect(result.pagination.total).toBe(1);
            expect(result.items).toHaveLength(1);
            const firstItem = result.items[0]!;
            expect(firstItem.orderNumber).toBe("ORD-2026-001");
            expect(firstItem.provider).toBe("RAZORPAY");
            expect(firstItem.errorCode).toBe("BAD_REQUEST_ERROR");
            expect(firstItem.customerEmail).toBe("customer@example.com");
            expect(firstItem.customerName).toBe("John Doe");
        });
    });

    describe("getOperationalHealth", () => {
        it("aggregates unfulfilled orders, pending reviews, and outbox queue telemetry", async () => {
            prismaMock.outboxEvent.count
                .mockResolvedValueOnce(4) // pending outbox
                .mockResolvedValueOnce(0); // failed outbox
            prismaMock.review.count.mockResolvedValue(7); // pending review moderation
            prismaMock.reviewReport.count.mockResolvedValue(2); // pending reports
            prismaMock.order.count.mockResolvedValue(12); // unfulfilled orders
            prismaMock.inventory.count.mockResolvedValue(3); // low stock

            const result = await dashboardService.getOperationalHealth();

            expect(result.status).toBe("HEALTHY");
            expect(result.backlogs.pendingOutboxEvents).toBe(4);
            expect(result.backlogs.failedOutboxEvents).toBe(0);
            expect(result.backlogs.pendingReviewModeration).toBe(7);
            expect(result.backlogs.unfulfilledOrders).toBe(12);
            expect(result.backlogs.lowStockCount).toBe(3);
        });
    });
});
