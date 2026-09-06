import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "cart-test-jwt-secret";

const { cartServiceMock, authPrismaMock } = vi.hoisted(() => ({
    cartServiceMock: {
        getCart: vi.fn(),
        addItem: vi.fn(),
        updateItemQuantity: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
        mergeGuestCart: vi.fn(),
        cleanupExpiredCarts: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/cart/services/cart.service.js", () => ({
    cartService: cartServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import cartRouter from "../modules/cart/routes/cart.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Cart HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(cartRouter, { prefix: "/api/cart" });
        return app;
    };

    const mockUser = () => {
        const userId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "shopper@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({ userId, email: "shopper@test.com", sessionId });
        return { userId, token };
    };

    it("allows guest access to retrieve shopping cart via session header", async () => {
        const app = await createTestApp();
        cartServiceMock.getCart.mockResolvedValue({
            id: "cart-guest",
            sessionId: "guest-session-123",
            summary: { itemCount: 0, totalItems: 0, subtotal: 0, currency: "USD" },
            items: [],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/cart",
            headers: { "x-session-id": "guest-session-123" },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.id).toBe("cart-guest");
        expect(cartServiceMock.getCart).toHaveBeenCalledWith(
            expect.objectContaining({ sessionId: "guest-session-123" }),
        );
    });

    it("adds item to cart with validation", async () => {
        const app = await createTestApp();
        const variantId = "6a405364-cfa6-4071-8bc6-adbb5d70f035";

        cartServiceMock.addItem.mockResolvedValue({
            id: "cart-1",
            summary: { itemCount: 1, totalItems: 2, subtotal: 100, currency: "USD" },
            items: [{ id: "item-1", variantId, quantity: 2 }],
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/cart/items",
            payload: {
                variantId,
                quantity: 2,
            },
        });

        expect(response.statusCode).toBe(201);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.summary.totalItems).toBe(2);
    });

    it("updates item quantity in cart", async () => {
        const app = await createTestApp();
        const itemId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        cartServiceMock.updateItemQuantity.mockResolvedValue({
            id: "cart-1",
            summary: { itemCount: 1, totalItems: 4, subtotal: 200, currency: "USD" },
            items: [{ id: itemId, quantity: 4 }],
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/cart/items/${itemId}`,
            payload: { quantity: 4 },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.summary.totalItems).toBe(4);
    });

    it("removes item from cart", async () => {
        const app = await createTestApp();
        const itemId = "a4175ef3-b1d6-4449-9f70-349f7e915570";

        cartServiceMock.removeItem.mockResolvedValue({
            id: "cart-1",
            summary: { itemCount: 0, totalItems: 0, subtotal: 0, currency: "USD" },
            items: [],
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/api/cart/items/${itemId}`,
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
    });

    it("clears cart", async () => {
        const app = await createTestApp();

        cartServiceMock.clearCart.mockResolvedValue({
            id: "cart-1",
            summary: { itemCount: 0, totalItems: 0, subtotal: 0, currency: "USD" },
            items: [],
        });

        const response = await app.inject({
            method: "DELETE",
            url: "/api/cart",
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
    });

    it("merges guest cart into user cart when authenticated", async () => {
        const app = await createTestApp();
        const { token, userId } = mockUser();

        cartServiceMock.mergeGuestCart.mockResolvedValue({
            id: "cart-user",
            userId,
            summary: { itemCount: 2, totalItems: 5, subtotal: 250, currency: "USD" },
            items: [],
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/cart/merge",
            headers: { authorization: `Bearer ${token}` },
            payload: { sessionId: "guest-sess-abc" },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(cartServiceMock.mergeGuestCart).toHaveBeenCalledWith(userId, "guest-sess-abc");
    });
});
