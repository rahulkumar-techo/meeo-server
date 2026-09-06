import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, cartServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        wishlist: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        wishlistItem: {
            findUnique: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
        },
        product: {
            findUnique: vi.fn(),
        },
    },
    cartServiceMock: {
        addItem: vi.fn(),
    },
}));

vi.mock("@/lib/prisma.js", () => ({
    prisma: prismaMock,
}));

vi.mock("@/modules/cart/services/cart.service.js", () => ({
    cartService: cartServiceMock,
}));

import { WishlistService } from "@/modules/wishlists/services/wishlist.service.js";
import { AppError } from "@/common/errors/app-error.js";

describe("WishlistService Unit Tests", () => {
    let service: WishlistService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new WishlistService();
    });

    describe("getOrCreateWishlist & getWishlist", () => {
        it("returns formatted wishlist with product details and price range", async () => {
            const userId = "user-wish-1";
            const mockWishlist = {
                id: "wl-1",
                userId,
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [
                    {
                        createdAt: new Date(),
                        product: {
                            id: "prod-1",
                            name: "Wireless Headphones",
                            slug: "wireless-headphones",
                            description: "Noise cancelling",
                            status: "ACTIVE",
                            isFeatured: true,
                            images: [{ url: "https://example.com/hp.jpg" }],
                            category: { id: "cat-1", name: "Audio", slug: "audio" },
                            brand: { id: "brand-1", name: "Sony", slug: "sony" },
                            variants: [
                                { id: "v1", sku: "HP-BLK", price: 199.99, compareAtPrice: 249.99, inventory: { availableQuantity: 5 } },
                                { id: "v2", sku: "HP-SLV", price: 219.99, compareAtPrice: null, inventory: { availableQuantity: 0 } },
                            ],
                        },
                    },
                ],
            };

            prismaMock.wishlist.findUnique.mockResolvedValue(mockWishlist);

            const result = await service.getWishlist(userId);

            expect(result.id).toBe("wl-1");
            expect(result.itemCount).toBe(1);
            expect(result.items[0].name).toBe("Wireless Headphones");
            expect(result.items[0].pricing.minPrice).toBe(199.99);
            expect(result.items[0].pricing.maxPrice).toBe(219.99);
            expect(result.items[0].inStock).toBe(true);
        });
    });

    describe("addProduct", () => {
        it("adds an active product to wishlist", async () => {
            const userId = "user-1";
            const productId = "prod-1";

            prismaMock.wishlist.findUnique
                .mockResolvedValueOnce({ id: "wl-1", userId, items: [] })
                .mockResolvedValueOnce({
                    id: "wl-1",
                    userId,
                    items: [
                        {
                            createdAt: new Date(),
                            product: {
                                id: productId,
                                name: "Product A",
                                status: "ACTIVE",
                                variants: [{ price: 50, inventory: { availableQuantity: 2 } }],
                            },
                        },
                    ],
                });

            prismaMock.product.findUnique.mockResolvedValue({
                id: productId,
                name: "Product A",
                status: "ACTIVE",
                deletedAt: null,
            });

            prismaMock.wishlistItem.findUnique.mockResolvedValue(null);
            prismaMock.wishlistItem.create.mockResolvedValue({ wishlistId: "wl-1", productId });

            const result = await service.addProduct(userId, productId);

            expect(prismaMock.wishlistItem.create).toHaveBeenCalledWith({
                data: { wishlistId: "wl-1", productId },
            });
            expect(result.itemCount).toBe(1);
        });

        it("throws 404 AppError if product is inactive or not found", async () => {
            prismaMock.wishlist.findUnique.mockResolvedValue({ id: "wl-1", userId: "u1", items: [] });
            prismaMock.product.findUnique.mockResolvedValue(null);

            await expect(service.addProduct("u1", "missing-prod")).rejects.toThrow(AppError);
        });
    });

    describe("removeProduct", () => {
        it("removes product from wishlist", async () => {
            const userId = "u1";
            const productId = "p1";

            prismaMock.wishlist.findUnique
                .mockResolvedValueOnce({ id: "wl-1", userId, items: [] })
                .mockResolvedValueOnce({ id: "wl-1", userId, items: [] });

            prismaMock.wishlistItem.findUnique.mockResolvedValue({
                wishlistId: "wl-1",
                productId,
            });

            const result = await service.removeProduct(userId, productId);

            expect(prismaMock.wishlistItem.delete).toHaveBeenCalledWith({
                where: {
                    wishlistId_productId: {
                        wishlistId: "wl-1",
                        productId,
                    },
                },
            });
            expect(result.itemCount).toBe(0);
        });

        it("throws 404 AppError if item not in wishlist", async () => {
            prismaMock.wishlist.findUnique.mockResolvedValue({ id: "wl-1", userId: "u1", items: [] });
            prismaMock.wishlistItem.findUnique.mockResolvedValue(null);

            await expect(service.removeProduct("u1", "not-in-wl")).rejects.toThrow(AppError);
        });
    });

    describe("moveToCart", () => {
        it("adds selected variant to cart and removes product from wishlist", async () => {
            const userId = "u1";
            const productId = "prod-move-1";
            const variantId = "var-move-1";

            prismaMock.product.findUnique.mockResolvedValue({
                id: productId,
                name: "Moveable Item",
                status: "ACTIVE",
                deletedAt: null,
                variants: [
                    { id: variantId, status: "ACTIVE", inventory: { availableQuantity: 5 } },
                ],
            });

            prismaMock.wishlist.findUnique
                .mockResolvedValueOnce({ id: "wl-1", userId, items: [] })
                .mockResolvedValueOnce({ id: "wl-1", userId, items: [] });

            prismaMock.wishlistItem.findUnique.mockResolvedValue({
                wishlistId: "wl-1",
                productId,
            });

            cartServiceMock.addItem.mockResolvedValue({ id: "cart-1", items: [] });

            const result = await service.moveToCart(userId, productId, { variantId, quantity: 2 });

            expect(cartServiceMock.addItem).toHaveBeenCalledWith(
                { userId },
                { variantId, quantity: 2 },
            );
            expect(prismaMock.wishlistItem.delete).toHaveBeenCalled();
            expect(result.message).toContain("Moveable Item");
        });
    });
});
