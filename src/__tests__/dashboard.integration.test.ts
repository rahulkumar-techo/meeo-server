import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "dashboard-test-jwt-secret";

const { dashboardServiceMock, authPrismaMock } = vi.hoisted(() => ({
    dashboardServiceMock: {
        getExecutiveOverview: vi.fn(),
        getSalesAndRevenueChart: vi.fn(),
        getTopSellingProducts: vi.fn(),
        getLowStockAlerts: vi.fn(),
        getRecentFailedPayments: vi.fn(),
        getOperationalHealth: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/dashboard/services/dashboard.service.js", () => ({
    dashboardService: dashboardServiceMock,
}));

vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import dashboardRouter from "../modules/dashboard/routes/dashboard.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Admin Dashboard HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(dashboardRouter, { prefix: "/api/v1/admin/dashboard" });
        return app;
    };

    const mockCustomerUser = () => {
        const userId = "customer-uuid-0001";
        const sessionId = "session-uuid-0001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "customer@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "customer@test.com",
        });

        return { token, userId };
    };

    const mockAdminUser = () => {
        const userId = "admin-uuid-0001";
        const sessionId = "session-admin-0001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@test.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.DASHBOARD_READ } },
                        ],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "admin@test.com",
        });

        return { token, userId };
    };

    describe("Authentication & RBAC Permissions", () => {
        it("rejects unauthenticated requests with 401 Unauthorized", async () => {
            const app = await createTestApp();

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/overview",
            });

            expect(res.statusCode).toBe(401);
            await app.close();
        });

        it("rejects non-admin customers with 403 Forbidden", async () => {
            const app = await createTestApp();
            const { token } = mockCustomerUser();

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/overview",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(403);
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/overview", () => {
        it("returns overview KPIs for authorized admin", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getExecutiveOverview.mockResolvedValue({
                period: "30d",
                revenue: { grossRevenue: 250000, totalRefunds: 5000, netRevenue: 245000, totalDiscountGranted: 10000, averageOrderValue: 2500 },
                orders: { totalOrders: 100, successfulOrders: 95, fulfillmentRate: 90, statusBreakdown: { CONFIRMED: 50, DELIVERED: 45 } },
                users: { totalUsers: 600, activeUsers: 580, suspendedUsers: 15, blockedUsers: 5, newUsersInPeriod: 60 },
                inventory: { totalTrackedVariants: 120, totalPhysicalUnits: 5000, totalReservedUnits: 200, inStockCount: 110, lowStockCount: 8, outOfStockCount: 2 },
                payments: { totalAttempts: 100, successfulPayments: 98, failedPayments: 2, failureRate: 2, gatewayBreakdown: { STRIPE: 80, RAZORPAY: 20 } },
                reviews: { totalReviews: 300, pendingModeration: 5, approvedReviews: 290, rejectedReviews: 5, pendingAbuseReports: 2, averagePlatformRating: 4.7 },
                promotions: { activeCouponsCount: 15 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/overview?period=30d",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.period).toBe("30d");
            expect(json.data.orders.totalOrders).toBe(100);
            expect(json.data.revenue.netRevenue).toBe(245000);
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/sales-chart", () => {
        it("returns time-series sales chart data", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getSalesAndRevenueChart.mockResolvedValue({
                period: "7d",
                interval: "day",
                dataPoints: [
                    { date: "2026-09-01", revenue: 10000, orderCount: 3 },
                    { date: "2026-09-02", revenue: 15000, orderCount: 4 },
                ],
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/sales-chart?period=7d&interval=day",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.dataPoints).toHaveLength(2);
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/top-sellers", () => {
        it("returns top selling products", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getTopSellingProducts.mockResolvedValue([
                {
                    productId: "p1",
                    name: "Flagship Smartphone",
                    slug: "flagship-smartphone",
                    thumbnail: "https://ik.imagekit.io/phone.jpg",
                    unitsSold: 50,
                    totalRevenue: 2500000,
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/top-sellers?limit=10&period=30d",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data[0].name).toBe("Flagship Smartphone");
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/low-stock", () => {
        it("returns low stock inventory items", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getLowStockAlerts.mockResolvedValue({
                items: [
                    {
                        inventoryId: "inv-1",
                        variantId: "v1",
                        sku: "SKU-LOW",
                        productName: "Leather Wallet",
                        productId: "p1",
                        productSlug: "leather-wallet",
                        price: 2500,
                        availableQuantity: 2,
                        reservedQuantity: 1,
                        reorderLevel: 10,
                        isOutOfStock: false,
                    },
                ],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/low-stock?threshold=10&page=1&limit=20",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.items[0].availableQuantity).toBe(2);
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/failed-payments", () => {
        it("returns recent failed payments", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getRecentFailedPayments.mockResolvedValue({
                items: [
                    {
                        attemptId: "att-fail-1",
                        paymentId: "pay-1",
                        provider: "RAZORPAY",
                        errorCode: "PAYMENT_CANCELLED",
                        errorMessage: "Customer cancelled payment window",
                        attemptNumber: 1,
                        amount: 3200,
                        currency: "INR",
                        orderId: "ord-1",
                        orderNumber: "ORD-999",
                        customerEmail: "cust@store.com",
                        customerName: "Alice Smith",
                        createdAt: new Date("2026-09-06T10:00:00Z"),
                    },
                ],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/failed-payments?limit=10&page=1",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.items[0].errorCode).toBe("PAYMENT_CANCELLED");
            await app.close();
        });
    });

    describe("GET /api/v1/admin/dashboard/health", () => {
        it("returns operational health telemetry", async () => {
            const app = await createTestApp();
            const { token } = mockAdminUser();

            dashboardServiceMock.getOperationalHealth.mockResolvedValue({
                status: "HEALTHY",
                timestamp: "2026-09-06T18:00:00Z",
                backlogs: {
                    pendingOutboxEvents: 1,
                    failedOutboxEvents: 0,
                    pendingReviewModeration: 3,
                    pendingReviewReports: 1,
                    unfulfilledOrders: 8,
                    lowStockCount: 2,
                },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/admin/dashboard/health",
                headers: {
                    authorization: `Bearer ${token}`,
                },
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.status).toBe("HEALTHY");
            expect(json.data.backlogs.unfulfilledOrders).toBe(8);
            await app.close();
        });
    });
});
