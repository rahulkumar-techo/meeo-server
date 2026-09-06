import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "critical-flow-test-jwt-secret";
process.env.JWT_REFRESH_SECRET = "critical-flow-test-refresh-secret";

const {
    authServiceMock,
    cartServiceMock,
    couponServiceMock,
    couponCalculationServiceMock,
    orderServiceMock,
    paymentServiceMock,
    notificationDispatcherMock,
    outboxPublisherMock,
    processedEventServiceMock,
    authPrismaMock,
} = vi.hoisted(() => ({
    authServiceMock: {
        register: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        refreshTokens: vi.fn(),
        getCurrentUser: vi.fn(),
    },
    cartServiceMock: {
        addItem: vi.fn(),
        getCart: vi.fn(),
        updateItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    },
    couponServiceMock: {
        applyCouponToCart: vi.fn(),
        validateCouponForOrder: vi.fn(),
    },
    couponCalculationServiceMock: {
        validateAndCalculate: vi.fn(),
    },
    orderServiceMock: {
        createOrder: vi.fn(),
        validateCheckout: vi.fn(),
        getOrderById: vi.fn(),
        confirmOrder: vi.fn(),
    },
    paymentServiceMock: {
        initializePayment: vi.fn(),
        processWebhook: vi.fn(),
        getPaymentById: vi.fn(),
    },
    notificationDispatcherMock: {
        dispatch: vi.fn(),
        sendNotificationForEvent: vi.fn(),
        listUserNotifications: vi.fn(),
    },
    outboxPublisherMock: {
        pollAndPublishBatch: vi.fn(),
    },
    processedEventServiceMock: {
        runWithConsumerIdempotency: vi.fn(async (_name, _id, fn) => {
            const data = await fn();
            return { success: true, alreadyProcessed: false, data };
        }),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../common/utils/auth-cache.js", () => ({
    getAuthContext: vi.fn().mockResolvedValue(null),
    setAuthContext: vi.fn().mockResolvedValue(undefined),
    clearAuthContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/redis.js", () => ({
    redis: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        on: vi.fn(),
    },
}));

vi.mock("../modules/auth/auth.service.js", () => ({
    authService: authServiceMock,
}));
vi.mock("../modules/cart/services/cart.service.js", () => ({
    cartService: cartServiceMock,
}));
vi.mock("../modules/coupons/services/coupon.service.js", () => ({
    couponService: couponServiceMock,
}));
vi.mock("../modules/coupons/services/couponCalculation.service.js", () => ({
    couponCalculationService: couponCalculationServiceMock,
}));
vi.mock("../modules/orders/services/order.service.js", () => ({
    orderService: orderServiceMock,
}));
vi.mock("../modules/payments/services/payment.service.js", () => ({
    paymentService: paymentServiceMock,
}));
vi.mock("../modules/notifications/services/notificationDispatcher.service.js", () => ({
    notificationDispatcherService: notificationDispatcherMock,
}));
vi.mock("../modules/outbox/services/outboxPublisher.service.js", () => ({
    outboxPublisherService: outboxPublisherMock,
}));
vi.mock("../modules/outbox/services/processedEvent.service.js", () => ({
    processedEventService: processedEventServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import authRouter from "../modules/auth/auth.route.js";
import cartRouter from "../modules/cart/routes/cart.route.js";
import couponRouter from "../modules/coupons/routes/coupon.route.js";
import orderRouter from "../modules/orders/routes/order.route.js";
import paymentRouter from "../modules/payments/routes/payment.route.js";
import notificationRouter from "../modules/notifications/routes/notification.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { NotificationConsumer } from "../modules/outbox/handlers/consumers/notificationConsumer.js";

describe("Critical Business Flows E2E Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        processedEventServiceMock.runWithConsumerIdempotency.mockImplementation(async (_name, _id, fn) => {
            const data = await fn();
            return { success: true, alreadyProcessed: false, data };
        });
    });

    const createTestApp = async () => {
        const app = Fastify({
            requestIdHeader: "x-request-id",
            genReqId: () => "critical-flow-req-id",
        });
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(authRouter, { prefix: "/api/auth" });
        await app.register(cartRouter, { prefix: "/api/cart" });
        await app.register(couponRouter, { prefix: "/api/coupons" });
        await app.register(orderRouter, { prefix: "/api/orders" });
        await app.register(paymentRouter, { prefix: "/api/payments" });
        await app.register(notificationRouter, { prefix: "/api/notifications" });
        return app;
    };

    const mockCustomerUser = (userId = "f47ac10b-58cc-4372-a567-0e02b2c3d479", email = "jane.doe@example.com") => {
        const sessionId = "a38c410b-58cc-4372-a567-0e02b2c3d480";
        const token = generateAccessToken({
            userId,
            email,
            sessionId,
        });

        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email,
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "CUSTOMER",
                        permissions: [],
                    },
                },
            ],
            profile: { firstName: "Jane", lastName: "Doe", phone: "+1234567890" },
        });

        authPrismaMock.userSession.findUnique.mockResolvedValue({
            id: sessionId,
            userId,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        });

        return { userId, sessionId, token, email };
    };

    // =========================================================================
    // Flow 1: Register → Login → Authenticated Profile
    // =========================================================================
    describe("Critical Flow 1: Register → Login → Authenticated Profile", () => {
        it("completes full registration, login, and authenticated user profile flow", async () => {
            const app = await createTestApp();
            const customer = mockCustomerUser();

            // 1. Register
            authServiceMock.register.mockResolvedValue({
                id: customer.userId,
                email: customer.email,
                firstName: "Jane",
                lastName: "Doe",
                role: "CUSTOMER",
                isEmailVerified: false,
            });

            const registerRes = await app.inject({
                method: "POST",
                url: "/api/auth/register",
                payload: {
                    firstName: "Jane",
                    lastName: "Doe",
                    email: customer.email,
                    password: "Pass123!",
                },
            });

            expect(registerRes.statusCode).toBe(201);
            expect(registerRes.json().success).toBe(true);
            expect(authServiceMock.register).toHaveBeenCalledWith({
                firstName: "Jane",
                lastName: "Doe",
                email: customer.email,
                password: "Pass123!",
            });

            // 2. Login
            authServiceMock.login.mockResolvedValue({
                accessToken: customer.token,
                refreshToken: "refresh-token-xyz",
                user: {
                    id: customer.userId,
                    email: customer.email,
                    role: "CUSTOMER",
                    permissions: [],
                },
            });

            const loginRes = await app.inject({
                method: "POST",
                url: "/api/auth/login",
                payload: {
                    email: customer.email,
                    password: "Pass123!",
                },
            });

            expect(loginRes.statusCode).toBe(200);
            const loginData = loginRes.json().data;
            expect(loginData.accessToken).toBe(customer.token);
            expect(loginData.user.email).toBe(customer.email);

            // 3. Access Authenticated Profile via Bearer Token
            authServiceMock.getCurrentUser.mockResolvedValue({
                id: customer.userId,
                email: customer.email,
                role: "CUSTOMER",
                firstName: "Jane",
                lastName: "Doe",
            });

            const meRes = await app.inject({
                method: "GET",
                url: "/api/auth/me",
                headers: {
                    Authorization: `Bearer ${customer.token}`,
                },
            });

            expect(meRes.statusCode).toBe(200);
            expect(meRes.json().data.id).toBe(customer.userId);
            expect(meRes.json().data.email).toBe(customer.email);
        });
    });

    // =========================================================================
    // Flow 2: Cart Items → Coupon Application & Discount Calculation
    // =========================================================================
    describe("Critical Flow 2: Cart Items → Coupon Application & Calculation", () => {
        it("adds items to cart and validates promotional discount calculation", async () => {
            const app = await createTestApp();
            const customer = mockCustomerUser();
            const variantId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

            // 1. Add Item to Cart
            cartServiceMock.addItem.mockResolvedValue({
                id: "c56a4180-65aa-42ec-a945-5fd21dec0538",
                sessionId: customer.sessionId,
                userId: customer.userId,
                items: [
                    {
                        id: "i12a4180-65aa-42ec-a945-5fd21dec0539",
                        variantId,
                        quantity: 2,
                        price: 50.0,
                        variant: { product: { name: "Ergonomic Desk" } },
                    },
                ],
                subtotal: 100.0,
                discountTotal: 0,
                grandTotal: 100.0,
            });

            const addCartRes = await app.inject({
                method: "POST",
                url: "/api/cart/items",
                headers: { Authorization: `Bearer ${customer.token}` },
                payload: {
                    variantId,
                    quantity: 2,
                },
            });

            expect(addCartRes.statusCode).toBe(201);
            expect(addCartRes.json().data.items.length).toBe(1);

            // 2. Validate / Calculate Coupon
            couponCalculationServiceMock.validateAndCalculate.mockResolvedValue({
                valid: true,
                message: "Coupon SAVE20 applied successfully",
                couponId: "cpn-uuid-12345",
                code: "SAVE20",
                type: "PERCENTAGE",
                discountAmount: 20.0,
                subtotal: 100.0,
                finalTotal: 80.0,
                freeShipping: false,
            });

            const couponRes = await app.inject({
                method: "POST",
                url: "/api/coupons/validate",
                headers: { Authorization: `Bearer ${customer.token}` },
                payload: {
                    code: "SAVE20",
                    subtotal: 100.0,
                },
            });

            expect(couponRes.statusCode).toBe(200);
            const couponData = couponRes.json().data;
            expect(couponData.discountAmount).toBe(20.0);
            expect(couponData.finalTotal).toBe(80.0);
            expect(couponCalculationServiceMock.validateAndCalculate).toHaveBeenCalledWith(
                "SAVE20",
                100.0,
                customer.userId,
            );
        });
    });

    // =========================================================================
    // Flow 3: Checkout → Payment Initialization
    // =========================================================================
    describe("Critical Flow 3: Checkout → Payment Initialization", () => {
        it("places order and initializes payment gateway transaction session", async () => {
            const app = await createTestApp();
            const customer = mockCustomerUser();

            const cartId = "c56a4180-65aa-42ec-a945-5fd21dec0538";
            const orderId = "b11a4180-65aa-42ec-a945-5fd21dec0538";

            const checkoutPayload = {
                cartId,
                shippingAddress: {
                    recipientName: "Jane Doe",
                    addressLine1: "123 Tech Lane",
                    city: "San Francisco",
                    state: "CA",
                    postalCode: "94105",
                    country: "USA",
                },
                currency: "USD",
                couponCode: "SAVE20",
            };

            // 1. Checkout & Create Order
            orderServiceMock.createOrder.mockResolvedValue({
                id: orderId,
                orderNumber: "ORD-2026-888",
                userId: customer.userId,
                status: "PENDING",
                currency: "USD",
                subtotal: 100.0,
                discountTotal: 20.0,
                taxTotal: 8.0,
                shippingTotal: 0.0,
                grandTotal: 88.0,
                items: [{ id: "oi-1", variantId: "e5033c46-95e3-4d22-b5e1-0bfab4b901a1", quantity: 2, price: 50.0 }],
            });

            const orderRes = await app.inject({
                method: "POST",
                url: "/api/orders/checkout",
                headers: { Authorization: `Bearer ${customer.token}` },
                payload: checkoutPayload,
            });

            expect(orderRes.statusCode).toBe(201);
            const createdOrder = orderRes.json().data;
            expect(createdOrder.id).toBe(orderId);
            expect(createdOrder.status).toBe("PENDING");
            expect(createdOrder.grandTotal).toBe(88.0);

            // 2. Initialize Payment Session
            paymentServiceMock.initializePayment.mockResolvedValue({
                paymentId: "pay-777",
                orderId,
                provider: "RAZORPAY",
                status: "INITIALIZED",
                currency: "USD",
                amount: 88.0,
                gatewayTransactionId: "order_rzp_gateway_12345",
                checkoutUrl: "https://api.razorpay.com/checkout/order_rzp_gateway_12345",
            });

            const payRes = await app.inject({
                method: "POST",
                url: "/api/payments/initialize",
                headers: { Authorization: `Bearer ${customer.token}` },
                payload: {
                    orderId,
                    provider: "RAZORPAY",
                },
            });

            expect(payRes.statusCode).toBe(201);
            const paymentData = payRes.json().data;
            expect(paymentData.paymentId).toBe("pay-777");
            expect(paymentData.gatewayTransactionId).toBe("order_rzp_gateway_12345");
            expect(paymentData.status).toBe("INITIALIZED");
        });
    });

    // =========================================================================
    // Flow 4: Payment Webhook → Order Confirmation
    // =========================================================================
    describe("Critical Flow 4: Payment Webhook → Order Confirmation", () => {
        it("processes payment capture webhook and confirms order state", async () => {
            const app = await createTestApp();

            paymentServiceMock.processWebhook.mockResolvedValue({
                acknowledged: true,
                paymentId: "pay-777",
                orderId: "b11a4180-65aa-42ec-a945-5fd21dec0538",
                status: "CAPTURED",
                gatewayEvent: "payment.captured",
            });

            const webhookPayload = {
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_rzp_gateway_999",
                            order_id: "order_rzp_gateway_12345",
                            status: "captured",
                            amount: 8800,
                            currency: "USD",
                        },
                    },
                },
            };

            const webhookRes = await app.inject({
                method: "POST",
                url: "/api/payments/webhook/razorpay",
                headers: {
                    "x-razorpay-signature": "valid-crypto-hmac-signature",
                },
                payload: webhookPayload,
            });

            expect(webhookRes.statusCode).toBe(200);
            expect(webhookRes.json().status).toBe("CAPTURED");
            expect(paymentServiceMock.processWebhook).toHaveBeenCalledWith(
                "razorpay",
                webhookPayload,
                expect.objectContaining({
                    "x-razorpay-signature": "valid-crypto-hmac-signature",
                }),
            );
        });
    });

    // =========================================================================
    // Flow 5: Order Confirmation → Outbox Relay → Notification Consumer Dispatch
    // =========================================================================
    describe("Critical Flow 5: Order Confirmation → Outbox Relay → Notification Consumer Dispatch", () => {
        it("processes ORDER_CONFIRMED event through NotificationConsumer and dispatches notification", async () => {
            const customer = mockCustomerUser();

            notificationDispatcherMock.sendNotificationForEvent.mockResolvedValue({
                eventType: "ORDER_CONFIRMED",
                channelsAttempted: ["EMAIL", "IN_APP"],
                results: [{ channel: "EMAIL", success: true }, { channel: "IN_APP", success: true }],
            });

            // Simulating BullMQ Job payload generated by Transactional Outbox
            const jobData = {
                id: "evt-uuid-101",
                eventType: "ORDER_CONFIRMED",
                aggregateType: "Order",
                aggregateId: "b11a4180-65aa-42ec-a945-5fd21dec0538",
                payload: {
                    orderId: "b11a4180-65aa-42ec-a945-5fd21dec0538",
                    orderNumber: "ORD-2026-888",
                    userId: customer.userId,
                    email: customer.email,
                    customerName: "Jane Doe",
                    grandTotal: 88.0,
                    currency: "USD",
                },
                createdAt: new Date().toISOString(),
            };

            const consumer = new NotificationConsumer();
            const result = await consumer.handleEvent(jobData);

            expect(result.success).toBe(true);
            expect(notificationDispatcherMock.sendNotificationForEvent).toHaveBeenCalledWith(
                "ORDER_CONFIRMED",
                {
                    userId: customer.userId,
                    email: customer.email,
                    customerName: "Jane Doe",
                },
                jobData.payload,
            );
        });
    });
});
