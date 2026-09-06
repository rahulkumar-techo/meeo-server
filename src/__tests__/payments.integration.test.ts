import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "payment-test-jwt-secret";

const { paymentServiceMock, authPrismaMock } = vi.hoisted(() => ({
    paymentServiceMock: {
        initializePayment: vi.fn(),
        retryPayment: vi.fn(),
        getPaymentById: vi.fn(),
        processWebhook: vi.fn(),
        processRefund: vi.fn(),
        reconcilePayment: vi.fn(),
        listPayments: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/payments/services/payment.service.js", () => ({
    paymentService: paymentServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import paymentRouter from "../modules/payments/routes/payment.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Payment HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(paymentRouter, { prefix: "/api/payments" });
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
        const token = generateAccessToken({ userId, sessionId, email: "buyer@test.com" });
        return { userId, token };
    };

    const mockAdminUser = (permissions: string[] = [PERMISSIONS.PAYMENT_READ, PERMISSIONS.PAYMENT_REFUND]) => {
        const userId = "a1111111-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "b2222222-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@test.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "ADMIN",
                        permissions: permissions.map((p) => ({
                            permission: { name: p },
                        })),
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });
        const token = generateAccessToken({ userId, sessionId, email: "admin@test.com" });
        return { userId, token };
    };

    it("initializes payment session via POST /api/payments/initialize", async () => {
        const app = await createTestApp();
        const { token } = mockCustomerUser();

        paymentServiceMock.initializePayment.mockResolvedValue({
            paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            orderId: "d1111111-95e3-4d22-b5e1-0bfab4b901a1",
            orderNumber: "ORD-20260906-0001",
            provider: "MOCK",
            clientSecret: "mock_sec_123",
            checkoutUrl: "https://checkout.example.com/pay/mock_pay_123",
            amount: 150.0,
            currency: "USD",
            status: "PENDING",
            attemptNumber: 1,
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/payments/initialize",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                orderId: "d1111111-95e3-4d22-b5e1-0bfab4b901a1",
                provider: "MOCK",
            },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.paymentId).toBe("c1111111-95e3-4d22-b5e1-0bfab4b901a1");
        expect(body.data.checkoutUrl).toBeDefined();
    });

    it("retries payment attempt via POST /api/payments/retry", async () => {
        const app = await createTestApp();
        const { token } = mockCustomerUser();

        paymentServiceMock.retryPayment.mockResolvedValue({
            paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            orderId: "d1111111-95e3-4d22-b5e1-0bfab4b901a1",
            provider: "MOCK",
            status: "PROCESSING",
            attemptNumber: 2,
            amount: 150.0,
            currency: "USD",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/payments/retry",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.attemptNumber).toBe(2);
    });

    it("fetches payment details via GET /api/payments/:id", async () => {
        const app = await createTestApp();
        const { token } = mockCustomerUser();

        paymentServiceMock.getPaymentById.mockResolvedValue({
            id: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            status: "SUCCESS",
            amount: 150.0,
            currency: "USD",
            paidAmount: 150.0,
            attempts: [{ attemptNumber: 1, status: "SUCCESS" }],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/payments/c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.status).toBe("SUCCESS");
    });

    it("ingests webhook event via POST /api/payments/webhook/:provider", async () => {
        const app = await createTestApp();

        paymentServiceMock.processWebhook.mockResolvedValue({
            idempotent: false,
            message: "Webhook processed successfully",
            status: "COMPLETED",
            paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/payments/webhook/mock",
            headers: {
                "x-test-bypass-signature": "true",
            },
            payload: {
                id: "evt_test_123",
                type: "payment_intent.succeeded",
                data: {
                    paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
                    amount: 150.0,
                },
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.received).toBe(true);
        expect(body.status).toBe("COMPLETED");
    });

    it("processes refund via POST /api/payments/refund with admin authorization", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([PERMISSIONS.PAYMENT_REFUND]);

        paymentServiceMock.processRefund.mockResolvedValue({
            refundId: "ref-1",
            paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            amount: 50.0,
            currency: "USD",
            status: "SUCCESS",
            paymentStatus: "PARTIALLY_REFUNDED",
            remainingBalance: 100.0,
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/payments/refund",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
                amount: 50.0,
                reason: "Customer partial return",
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.paymentStatus).toBe("PARTIALLY_REFUNDED");
    });

    it("reconciles payment via POST /api/payments/reconcile with admin authorization", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser([PERMISSIONS.PAYMENT_READ]);

        paymentServiceMock.reconcilePayment.mockResolvedValue({
            paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            orderId: "d1111111-95e3-4d22-b5e1-0bfab4b901a1",
            localStatus: "SUCCESS",
            remoteStatus: "SUCCESS",
            actionTaken: "RECONCILED_TO_SUCCESS",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/payments/reconcile",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                paymentId: "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.actionTaken).toBe("RECONCILED_TO_SUCCESS");
    });
});
