import { prisma } from "@/lib/prisma.js";
import { randomUUID } from "node:crypto";

export interface CartIdentity {
    userId?: string | undefined;
    sessionId?: string | undefined;
}

export const GUEST_CART_EXPIRATION_DAYS = 7;

export class CartSessionService {
    /**
     * Resolves or creates a cart based on authenticated userId or guest sessionId.
     */
    async getOrCreateCart(identity: CartIdentity) {
        const now = new Date();

        if (identity.userId) {
            let cart = await prisma.cart.findFirst({
                where: { userId: identity.userId },
                include: this.getCartInclude(),
            });

            if (!cart) {
                cart = await prisma.cart.create({
                    data: {
                        userId: identity.userId,
                    },
                    include: this.getCartInclude(),
                });
            }

            return { cart, sessionId: identity.sessionId };
        }

        const guestSessionId = identity.sessionId || randomUUID();
        identity.sessionId = guestSessionId;

        let cart = await prisma.cart.findFirst({
            where: { sessionId: guestSessionId },
            include: this.getCartInclude(),
        });

        if (cart) {
            if (cart.expiresAt && cart.expiresAt < now) {
                await prisma.cart.delete({ where: { id: cart.id } });
                cart = null;
            }
        }

        if (!cart) {
            const expiresAt = new Date(Date.now() + GUEST_CART_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
            cart = await prisma.cart.create({
                data: {
                    sessionId: guestSessionId,
                    expiresAt,
                },
                include: this.getCartInclude(),
            });
        }

        return { cart, sessionId: guestSessionId };
    }

    /**
     * Deletes all expired guest carts.
     */
    async cleanupExpiredCarts() {
        const result = await prisma.cart.deleteMany({
            where: {
                expiresAt: {
                    not: null,
                    lt: new Date(),
                },
            },
        });

        return {
            deletedCount: result.count,
            cleanedAt: new Date().toISOString(),
        };
    }

    /**
     * Common Prisma include specification for carts.
     */
    getCartInclude() {
        return {
            items: {
                orderBy: { createdAt: "asc" as const },
                include: {
                    variant: {
                        include: {
                            product: {
                                include: {
                                    images: {
                                        orderBy: { sortOrder: "asc" as const },
                                        take: 1,
                                    },
                                    category: { select: { id: true, name: true, slug: true } },
                                    brand: { select: { id: true, name: true, slug: true } },
                                },
                            },
                            inventory: true,
                            attributeValues: {
                                include: {
                                    attributeValue: {
                                        include: {
                                            attribute: { select: { id: true, name: true } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
    }

    /**
     * Formats cart data for API responses, calculating pricing and stock status.
     */
    formatCart(cart: any) {
        let totalItems = 0;
        let subtotal = 0;

        const items = (cart.items || []).map((item: any) => {
            const price = Number(item.variant.price);
            const compareAtPrice = item.variant.compareAtPrice ? Number(item.variant.compareAtPrice) : null;
            const lineTotal = Number((price * item.quantity).toFixed(2));
            const availableStock = item.variant.inventory ? item.variant.inventory.availableQuantity : 0;
            const isAvailable = item.variant.status === "ACTIVE" &&
                (!item.variant.product || item.variant.product.status === "ACTIVE") &&
                availableStock >= item.quantity;

            totalItems += item.quantity;
            subtotal += lineTotal;

            return {
                id: item.id,
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: price,
                compareAtPrice,
                lineTotal,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
                stockInfo: {
                    availableStock,
                    isAvailable,
                    isLowStock: item.variant.inventory ? availableStock <= (item.variant.inventory.reorderLevel ?? 5) : false,
                },
                product: {
                    id: item.variant.product?.id,
                    name: item.variant.product?.name ?? "Unknown Product",
                    slug: item.variant.product?.slug,
                    thumbnail: item.variant.product?.images?.[0]?.url ?? null,
                    category: item.variant.product?.category ?? null,
                    brand: item.variant.product?.brand ?? null,
                },
                variant: {
                    sku: item.variant.sku,
                    barcode: item.variant.barcode,
                    attributes: (item.variant.attributeValues || []).map((av: any) => ({
                        attribute: av.attributeValue?.attribute?.name ?? "Attribute",
                        value: av.attributeValue?.value ?? "",
                    })),
                },
            };
        });

        return {
            id: cart.id,
            userId: cart.userId,
            isGuest: !cart.userId,
            expiresAt: cart.expiresAt,
            createdAt: cart.createdAt,
            updatedAt: cart.updatedAt,
            summary: {
                itemCount: items.length,
                totalItems,
                subtotal: Number(subtotal.toFixed(2)),
                currency: "USD",
            },
            items,
        };
    }
}

export const cartSessionService = new CartSessionService();
