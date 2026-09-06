import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "wishlist-test-jwt-secret";

const { wishlistServiceMock, authPrismaMock } = vi.hoisted(() => ({
    wishlistServiceMock: {
        getWishlist: vi.fn(),
        addProduct: vi.fn(),
        removeProduct: vi.fn(),
        moveToCart: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/wishlists/services/wishlist.service.js", () => ({
    wishlistService: wishlistServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import wishlistRouter from "../modules/wishlists/routes/wishlist.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Wishlist HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(wishlistRouter, { prefix: "/api/wishlist" });
        return app;
    };

    const mockUser = () => {
        const userId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "wishlist-user@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({ userId, email: "wishlist-user@test.com", sessionId });
        return { userId, token };
    };

    it("requires authentication for wishlist endpoints", async () => {
        const app = await createTestApp();

        const response = await app.inject({
            method: "GET",
            url: "/api/wishlist",
        });

        expect(response.statusCode).toBe(401);
    });

    it("retrieves authenticated user wishlist", async () => {
        const app = await createTestApp();
        const { token, userId } = mockUser();

        wishlistServiceMock.getWishlist.mockResolvedValue({
            id: "wl-1",
            userId,
            itemCount: 1,
            items: [{ productId: "p1", name: "Camera" }],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/wishlist",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(payload.data.itemCount).toBe(1);
        expect(wishlistServiceMock.getWishlist).toHaveBeenCalledWith(userId);
    });

    it("adds product to wishlist", async () => {
        const app = await createTestApp();
        const { token, userId } = mockUser();
        const productId = "6a405364-cfa6-4071-8bc6-adbb5d70f035";

        wishlistServiceMock.addProduct.mockResolvedValue({
            id: "wl-1",
            userId,
            itemCount: 1,
            items: [{ productId, name: "Headphones" }],
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/wishlist/products/${productId}`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(201);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(wishlistServiceMock.addProduct).toHaveBeenCalledWith(userId, productId);
    });

    it("removes product from wishlist", async () => {
        const app = await createTestApp();
        const { token, userId } = mockUser();
        const productId = "6a405364-cfa6-4071-8bc6-adbb5d70f035";

        wishlistServiceMock.removeProduct.mockResolvedValue({
            id: "wl-1",
            userId,
            itemCount: 0,
            items: [],
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/api/wishlist/products/${productId}`,
            headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(wishlistServiceMock.removeProduct).toHaveBeenCalledWith(userId, productId);
    });

    it("moves product from wishlist to cart", async () => {
        const app = await createTestApp();
        const { token, userId } = mockUser();
        const productId = "6a405364-cfa6-4071-8bc6-adbb5d70f035";

        wishlistServiceMock.moveToCart.mockResolvedValue({
            message: "Moved product to cart",
            addedVariantId: "var-1",
            cart: { id: "cart-1", items: [] },
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/wishlist/products/${productId}/move-to-cart`,
            headers: { authorization: `Bearer ${token}` },
            payload: { quantity: 1 },
        });

        expect(response.statusCode).toBe(200);
        const payload = JSON.parse(response.payload);
        expect(payload.success).toBe(true);
        expect(wishlistServiceMock.moveToCart).toHaveBeenCalledWith(
            userId,
            productId,
            expect.objectContaining({ quantity: 1 }),
        );
    });
});
