import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "order-test-jwt-secret";

const { orderServiceMock, authPrismaMock } = vi.hoisted(() => ({
    orderServiceMock: {
        validateCheckout: vi.fn(),
        createOrder: vi.fn(),
        listUserOrders: vi.fn(),
        listAllOrders: vi.fn(),
        getOrderById: vi.fn(),
        getOrderByNumber: vi.fn(),
        cancelOrder: vi.fn(),
        updateOrderStatus: vi.fn(),
        confirmOrder: vi.fn(),
        processOrder: vi.fn(),
        shipOrder: vi.fn(),
        deliverOrder: vi.fn(),
        expireStaleOrders: vi.fn(),
        getOrderMetrics: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/orders/services/order.service.js", () => ({
    orderService: orderServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import orderRouter from "../modules/orders/routes/order.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Order HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(orderRouter, { prefix: "/api/orders" });
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

        const token = generateAccessToken({ userId, email: "buyer@test.com", sessionId });
        return { userId, token };
    };

    const mockAdminUser = () => {
        const adminId = "c8901234-5678-90ab-cdef-1234567890ab";
        const sessionId = "d9012345-6789-01bc-def0-2345678901bc";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: adminId,
            email: "admin@test.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.ORDER_READ } },
                            { permission: { name: PERMISSIONS.ORDER_UPDATE } },
                            { permission: { name: PERMISSIONS.ORDER_CANCEL } },
                        ],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId: adminId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({ userId: adminId, email: "admin@test.com", sessionId });
        return { adminId, token };
    };

    it("previews checkout calculation via validate-checkout", async () => {
        const app = await createTestApp();
        orderServiceMock.validateCheckout.mockResolvedValue({
            isValid: true,
            summary: {
                itemCount: 2,
                totalUnits: 3,
                subtotal: 150,
                discountTotal: 15,
                shippingTotal: 0,
                taxTotal: 12,
                grandTotal: 147,
                currency: "USD",
            },
            coupon: { code: "SAVE10", discountAmount: 15 },
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/orders/validate-checkout",
            payload: {
                shippingAddressId: "a4175ef3-b1d6-4449-9f70-349f7e915570",
                couponCode: "SAVE10",
            },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.summary.grandTotal).toBe(147);
    });

    it("executes checkout and places order with 201 status", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        orderServiceMock.createOrder.mockResolvedValue({
            id: "order-xyz",
            orderNumber: "ORD-20260906-ABCDE",
            userId,
            status: "PENDING",
            financials: {
                subtotal: 100,
                discountTotal: 0,
                taxTotal: 8,
                shippingTotal: 0,
                grandTotal: 108,
            },
            items: [{ id: "oi-1", productName: "Smart Watch", quantity: 1, total: 100 }],
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/orders/checkout",
            headers: {
                authorization: `Bearer ${token}`,
                "idempotency-key": "idemp-key-12345",
            },
            payload: {
                shippingAddress: {
                    recipientName: "Jane Doe",
                    addressLine1: "100 Broadway",
                    city: "New York",
                    state: "NY",
                    postalCode: "10001",
                    country: "USA",
                },
            },
        });

        expect(response.statusCode).toBe(201);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.orderNumber).toBe("ORD-20260906-ABCDE");
        expect(orderServiceMock.createOrder).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({
                shippingAddress: expect.objectContaining({ recipientName: "Jane Doe" }),
            }),
            "idemp-key-12345",
            undefined,
        );
    });

    it("retrieves paginated customer orders", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        orderServiceMock.listUserOrders.mockResolvedValue({
            items: [{ id: "order-1", orderNumber: "ORD-1" }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/orders",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.items).toHaveLength(1);
    });

    it("retrieves order details by ID", async () => {
        const app = await createTestApp();
        const { token } = mockCustomerUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.getOrderById.mockResolvedValue({
            id: orderId,
            orderNumber: "ORD-1",
            status: "PENDING",
            items: [],
        });

        const response = await app.inject({
            method: "GET",
            url: `/api/orders/${orderId}`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.id).toBe(orderId);
    });

    it("cancels an order on customer request", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.cancelOrder.mockResolvedValue({
            id: orderId,
            status: "CANCELLED",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/orders/${orderId}/cancel`,
            headers: { authorization: `Bearer ${token}` },
            payload: { reason: "Mistake in order" },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(orderServiceMock.cancelOrder).toHaveBeenCalledWith(
            orderId,
            userId,
            "Mistake in order",
            false,
        );
    });

    it("allows admin to update order status", async () => {
        const app = await createTestApp();
        const { token, adminId } = mockAdminUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.updateOrderStatus.mockResolvedValue({
            id: orderId,
            status: "SHIPPED",
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/orders/${orderId}/status`,
            headers: { authorization: `Bearer ${token}` },
            payload: { status: "SHIPPED", reason: "Dispatched with FedEx" },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(orderServiceMock.updateOrderStatus).toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ status: "SHIPPED" }),
            adminId,
        );
    });

    it("allows admin to confirm order via POST /api/orders/:id/confirm", async () => {
        const app = await createTestApp();
        const { token, adminId } = mockAdminUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.confirmOrder.mockResolvedValue({
            id: orderId,
            status: "CONFIRMED",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/orders/${orderId}/confirm`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(orderServiceMock.confirmOrder).toHaveBeenCalledWith(orderId, adminId);
    });

    it("allows admin to ship order via POST /api/orders/:id/ship", async () => {
        const app = await createTestApp();
        const { token, adminId } = mockAdminUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.shipOrder.mockResolvedValue({
            id: orderId,
            status: "SHIPPED",
            shipment: {
                carrier: "BlueDart",
                trackingNumber: "BD999888777",
            },
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/orders/${orderId}/ship`,
            headers: { authorization: `Bearer ${token}` },
            payload: {
                carrier: "BlueDart",
                trackingNumber: "BD999888777",
                trackingUrl: "https://bluedart.com/track/BD999888777",
            },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(orderServiceMock.shipOrder).toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ carrier: "BlueDart", trackingNumber: "BD999888777" }),
            adminId,
        );
    });

    it("allows admin to deliver order via POST /api/orders/:id/deliver", async () => {
        const app = await createTestApp();
        const { token, adminId } = mockAdminUser();
        const orderId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        orderServiceMock.deliverOrder.mockResolvedValue({
            id: orderId,
            status: "DELIVERED",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/orders/${orderId}/deliver`,
            headers: { authorization: `Bearer ${token}` },
            payload: {
                receivedBy: "Jane Doe",
                deliveryNotes: "Customer signed for delivery",
            },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(orderServiceMock.deliverOrder).toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ receivedBy: "Jane Doe" }),
            adminId,
        );
    });

    it("fetches order metrics via GET /api/orders/admin/metrics", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        orderServiceMock.getOrderMetrics.mockResolvedValue({
            totalOrders: 100,
            countsByStatus: { CONFIRMED: 20, DELIVERED: 80 },
            fulfilledOrders: 80,
            activeFulfillmentCount: 20,
            financials: { totalRevenue: 10000, averageOrderValue: 100, paidOrderCount: 100 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/orders/admin/metrics",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.totalOrders).toBe(100);
    });
});
