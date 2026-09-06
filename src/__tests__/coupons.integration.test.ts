import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "coupons-test-jwt-secret";

const { couponServiceMock, couponCalcMock, couponUsageMock, couponMetricsMock, authPrismaMock } = vi.hoisted(() => ({
    couponServiceMock: {
        createCoupon: vi.fn(),
        listCoupons: vi.fn(),
        getCouponById: vi.fn(),
        updateCoupon: vi.fn(),
        deleteCoupon: vi.fn(),
        toggleStatus: vi.fn(),
    },
    couponCalcMock: {
        validateAndCalculate: vi.fn(),
    },
    couponUsageMock: {
        getUserCouponHistory: vi.fn(),
        listCouponUsages: vi.fn(),
    },
    couponMetricsMock: {
        getCouponMetrics: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/coupons/services/coupon.service.js", () => ({
    couponService: couponServiceMock,
}));
vi.mock("../modules/coupons/services/couponCalculation.service.js", () => ({
    couponCalculationService: couponCalcMock,
}));
vi.mock("../modules/coupons/services/couponUsage.service.js", () => ({
    couponUsageService: couponUsageMock,
}));
vi.mock("../modules/coupons/services/couponMetrics.service.js", () => ({
    couponMetricsService: couponMetricsMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import couponRouter from "../modules/coupons/routes/coupon.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Coupons HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(couponRouter, { prefix: "/api/coupons" });
        return app;
    };

    const mockCustomerUser = () => {
        const userId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "buyer@test.com",
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
            email: "buyer@test.com",
        });

        return { token, userId };
    };

    const mockAdminUser = () => {
        const userId = "admin-uuid-1111-2222-333344445555";
        const sessionId = "session-admin-uuid-1111-2222";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.COUPON_READ } },
                            { permission: { name: PERMISSIONS.COUPON_CREATE } },
                            { permission: { name: PERMISSIONS.COUPON_UPDATE } },
                            { permission: { name: PERMISSIONS.COUPON_DELETE } },
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
            email: "admin@store.com",
        });

        return { token, userId };
    };

    it("previews coupon discount without authentication via POST /api/coupons/validate", async () => {
        const app = await createTestApp();

        couponCalcMock.validateAndCalculate.mockResolvedValue({
            isValid: true,
            coupon: { code: "SPRING20", type: "PERCENTAGE", value: 20 },
            originalSubtotal: 100,
            discountAmount: 20,
            newSubtotal: 80,
            isFreeShipping: false,
            message: "Coupon \"SPRING20\" applied: Saved $20.00!",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/coupons/validate",
            payload: {
                code: "spring20",
                subtotal: 100,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.discountAmount).toBe(20);
        expect(couponCalcMock.validateAndCalculate).toHaveBeenCalledWith("SPRING20", 100, undefined);
    });

    it("retrieves customer coupon redemption history via GET /api/coupons/my-history", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        couponUsageMock.getUserCouponHistory.mockResolvedValue({
            items: [
                {
                    id: "u-1",
                    discountAmount: 15,
                    coupon: { code: "SAVE15" },
                },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/coupons/my-history",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.items).toHaveLength(1);
        expect(couponUsageMock.getUserCouponHistory).toHaveBeenCalledWith(userId, expect.any(Object));
    });

    it("creates a new coupon via POST /api/coupons with admin credentials", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        couponServiceMock.createCoupon.mockResolvedValue({
            id: "c-created-1",
            code: "BLACKFRIDAY",
            type: "PERCENTAGE",
            value: 30,
            status: "ACTIVE",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/coupons",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                code: "blackfriday",
                type: "PERCENTAGE",
                value: 30,
                minimumOrderAmount: 50,
            },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.code).toBe("BLACKFRIDAY");
    });

    it("lists coupons with filters and pagination via GET /api/coupons", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        couponServiceMock.listCoupons.mockResolvedValue({
            items: [{ id: "c-1", code: "PROMO10", status: "ACTIVE" }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/coupons?status=ACTIVE&page=1",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.items).toHaveLength(1);
    });

    it("toggles coupon status via PATCH /api/coupons/:id/status", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();
        const couponId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        couponServiceMock.toggleStatus.mockResolvedValue({
            id: couponId,
            status: "INACTIVE",
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/coupons/${couponId}/status`,
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                status: "INACTIVE",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(couponServiceMock.toggleStatus).toHaveBeenCalledWith(couponId, { status: "INACTIVE" });
    });

    it("retrieves coupon analytics metrics via GET /api/coupons/metrics", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        couponMetricsMock.getCouponMetrics.mockResolvedValue({
            summary: { totalCoupons: 12, activeCoupons: 8, totalRedemptions: 240, totalDiscountGiven: 4800 },
            topCoupons: [],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/coupons/metrics",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.summary.totalCoupons).toBe(12);
    });
});
