import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        cart: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        cartItem: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: any) => any) => {
            if (typeof callback === "function") {
                return callback(prismaMock);
            }
            return Promise.all(callback as unknown as Promise<unknown>[]);
        }),
    },
}));

vi.mock("@/lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import { CartService } from "@/modules/cart/services/cart.service.js";
import { AppError } from "@/common/errors/app-error.js";

describe("CartService Unit Tests", () => {
    let service: CartService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CartService();
    });

    describe("getOrCreateCart", () => {
        it("returns existing user cart when userId is provided", async () => {
            const userId = "11111111-1111-1111-1111-111111111111";
            const mockCart = { id: "cart-1", userId, items: [] };
            prismaMock.cart.findFirst.mockResolvedValue(mockCart);

            const result = await service.getOrCreateCart({ userId });

            expect(prismaMock.cart.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId } }),
            );
            expect(result.cart.id).toBe("cart-1");
        });

        it("creates new user cart when none exists", async () => {
            const userId = "11111111-1111-1111-1111-111111111111";
            prismaMock.cart.findFirst.mockResolvedValue(null);
            prismaMock.cart.create.mockResolvedValue({ id: "new-cart", userId, items: [] });

            const result = await service.getOrCreateCart({ userId });

            expect(prismaMock.cart.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: { userId } }),
            );
            expect(result.cart.id).toBe("new-cart");
        });

        it("creates new guest cart with expiresAt when guest sessionId is provided", async () => {
            const sessionId = "guest-sess-1";
            prismaMock.cart.findFirst.mockResolvedValue(null);
            prismaMock.cart.create.mockResolvedValue({
                id: "guest-cart-1",
                sessionId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                items: [],
            });

            const result = await service.getOrCreateCart({ sessionId });

            expect(prismaMock.cart.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ sessionId }),
                }),
            );
            expect(result.cart.id).toBe("guest-cart-1");
        });

        it("deletes and recreates expired guest cart", async () => {
            const sessionId = "expired-sess-1";
            const expiredCart = {
                id: "exp-cart",
                sessionId,
                expiresAt: new Date(Date.now() - 10000),
                items: [],
            };
            prismaMock.cart.findFirst.mockResolvedValue(expiredCart);
            prismaMock.cart.delete.mockResolvedValue(expiredCart);
            prismaMock.cart.create.mockResolvedValue({
                id: "fresh-cart",
                sessionId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                items: [],
            });

            const result = await service.getOrCreateCart({ sessionId });

            expect(prismaMock.cart.delete).toHaveBeenCalledWith({ where: { id: "exp-cart" } });
            expect(prismaMock.cart.create).toHaveBeenCalled();
            expect(result.cart.id).toBe("fresh-cart");
        });
    });

    describe("addItem", () => {
        it("adds new variant to cart when stock is available", async () => {
            const userId = "user-1";
            const variantId = "var-1";
            const mockCart = { id: "cart-1", userId, items: [] };

            prismaMock.cart.findFirst.mockResolvedValue(mockCart);
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: variantId,
                sku: "SKU-TEST",
                status: "ACTIVE",
                price: 50.0,
                product: { id: "prod-1", name: "Test Product", status: "ACTIVE" },
                inventory: { availableQuantity: 10 },
            });
            prismaMock.cartItem.findUnique.mockResolvedValue(null);
            prismaMock.cartItem.create.mockResolvedValue({ id: "item-1" });
            prismaMock.cart.findUnique.mockResolvedValue({
                id: "cart-1",
                userId,
                items: [
                    {
                        id: "item-1",
                        variantId,
                        quantity: 2,
                        variant: {
                            sku: "SKU-TEST",
                            price: 50.0,
                            status: "ACTIVE",
                            product: { id: "prod-1", name: "Test Product", status: "ACTIVE", images: [] },
                            inventory: { availableQuantity: 10, reorderLevel: 2 },
                        },
                    },
                ],
            });

            const result = await service.addItem({ userId }, { variantId, quantity: 2 });

            expect(prismaMock.cartItem.create).toHaveBeenCalledWith({
                data: { cartId: "cart-1", variantId, quantity: 2 },
            });
            expect(result.summary.totalItems).toBe(2);
            expect(result.summary.subtotal).toBe(100.0);
        });

        it("throws AppError if variant is inactive", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: "var-inactive",
                status: "INACTIVE",
                product: { status: "ACTIVE" },
            });

            await expect(
                service.addItem({ userId: "u1" }, { variantId: "var-inactive", quantity: 1 }),
            ).rejects.toThrow(AppError);
        });

        it("throws AppError if requested quantity exceeds available inventory", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: "var-low",
                sku: "LOW-STOCK",
                status: "ACTIVE",
                product: { name: "Low Stock Product", status: "ACTIVE" },
                inventory: { availableQuantity: 3 },
            });
            prismaMock.cartItem.findUnique.mockResolvedValue({
                id: "item-1",
                quantity: 2,
            });

            await expect(
                service.addItem({ userId: "u1" }, { variantId: "var-low", quantity: 2 }),
            ).rejects.toThrow(/exceeds available stock/);
        });
    });

    describe("updateItemQuantity", () => {
        it("updates item quantity when valid and within stock", async () => {
            const mockCart = { id: "cart-1", userId: "u1", items: [] };
            prismaMock.cart.findFirst.mockResolvedValue(mockCart);
            prismaMock.cartItem.findFirst.mockResolvedValue({
                id: "item-1",
                cartId: "cart-1",
                variant: {
                    inventory: { availableQuantity: 15 },
                },
            });
            prismaMock.cartItem.update.mockResolvedValue({ id: "item-1", quantity: 5 });
            prismaMock.cart.findUnique.mockResolvedValue({
                id: "cart-1",
                userId: "u1",
                items: [
                    {
                        id: "item-1",
                        variantId: "var-1",
                        quantity: 5,
                        variant: {
                            sku: "SKU-1",
                            price: 20.0,
                            product: { name: "Item", images: [] },
                            inventory: { availableQuantity: 15 },
                        },
                    },
                ],
            });

            const result = await service.updateItemQuantity({ userId: "u1" }, "item-1", { quantity: 5 });

            expect(prismaMock.cartItem.update).toHaveBeenCalledWith({
                where: { id: "item-1" },
                data: { quantity: 5 },
            });
            expect(result.summary.totalItems).toBe(5);
        });

        it("deletes item when quantity is updated to 0", async () => {
            const mockCart = { id: "cart-1", userId: "u1", items: [] };
            prismaMock.cart.findFirst.mockResolvedValue(mockCart);
            prismaMock.cartItem.findFirst.mockResolvedValue({
                id: "item-1",
                cartId: "cart-1",
                variant: { inventory: { availableQuantity: 10 } },
            });
            prismaMock.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });

            await service.updateItemQuantity({ userId: "u1" }, "item-1", { quantity: 0 });

            expect(prismaMock.cartItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
        });
    });

    describe("removeItem", () => {
        it("removes item from cart", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });
            prismaMock.cartItem.findFirst.mockResolvedValue({ id: "item-1", cartId: "cart-1" });
            prismaMock.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });

            await service.removeItem({ userId: "u1" }, "item-1");

            expect(prismaMock.cartItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
        });

        it("throws 404 AppError if item not in cart", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });
            prismaMock.cartItem.findFirst.mockResolvedValue(null);

            await expect(service.removeItem({ userId: "u1" }, "missing-item")).rejects.toThrow(AppError);
        });
    });

    describe("clearCart", () => {
        it("deletes all items for the cart", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });
            prismaMock.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: "u1", items: [] });

            await service.clearCart({ userId: "u1" });

            expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({
                where: { cartId: "cart-1" },
            });
        });
    });

    describe("mergeGuestCart", () => {
        it("merges guest cart items into user cart and deletes guest cart", async () => {
            const guestSessionId = "guest-sess-merge";
            const userId = "user-123";

            const guestCart = {
                id: "guest-cart-id",
                sessionId: guestSessionId,
                items: [
                    {
                        variantId: "var-1",
                        quantity: 2,
                        variant: { inventory: { availableQuantity: 10 } },
                    },
                    {
                        variantId: "var-2",
                        quantity: 3,
                        variant: { inventory: { availableQuantity: 5 } },
                    },
                ],
            };

            const userCart = { id: "user-cart-id", userId, items: [] };

            const updatedUserCart = {
                id: "user-cart-id",
                userId,
                items: [
                    {
                        id: "item-1",
                        variantId: "var-1",
                        quantity: 3,
                        variant: { sku: "SKU1", price: 10, product: {}, inventory: { availableQuantity: 10 } },
                    },
                    {
                        id: "item-2",
                        variantId: "var-2",
                        quantity: 3,
                        variant: { sku: "SKU2", price: 20, product: {}, inventory: { availableQuantity: 5 } },
                    },
                ],
            };

            prismaMock.cart.findFirst
                .mockResolvedValueOnce(guestCart)       // find guest cart
                .mockResolvedValueOnce(userCart);       // getOrCreateCart user cart

            prismaMock.cart.findUnique.mockResolvedValue(updatedUserCart);

            // In transaction:
            prismaMock.cartItem.findUnique
                .mockResolvedValueOnce({ id: "existing-item-1", quantity: 1 }) // var-1 exists in user cart
                .mockResolvedValueOnce(null); // var-2 is new in user cart

            const result = await service.mergeGuestCart(userId, guestSessionId);

            expect(prismaMock.cartItem.update).toHaveBeenCalled();
            expect(prismaMock.cartItem.create).toHaveBeenCalled();
            expect(prismaMock.cart.delete).toHaveBeenCalledWith({ where: { id: "guest-cart-id" } });
            expect(result.summary.totalItems).toBe(6);
        });
    });

    describe("cleanupExpiredCarts", () => {
        it("deletes expired carts and returns count", async () => {
            prismaMock.cart.deleteMany.mockResolvedValue({ count: 4 });

            const result = await service.cleanupExpiredCarts();

            expect(result.deletedCount).toBe(4);
            expect(prismaMock.cart.deleteMany).toHaveBeenCalled();
        });
    });
});
