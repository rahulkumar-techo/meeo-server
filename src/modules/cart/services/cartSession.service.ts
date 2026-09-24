import { prisma } from "@/lib/prisma.js";

export class CartSessionService {
    /**
     * Resolves or creates a permanent shopping cart for the authenticated user.
     */
    async getOrCreateCart(userId: string) {
        let cart = await prisma.cart.findFirst({
            where: { userId },
            include: this.getCartInclude(),
        });

        if (!cart) {
            cart = await prisma.cart.create({
                data: { userId },
                include: this.getCartInclude(),
            });
        }

        return cart;
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
            const price = Number(item.variant?.price ?? 0);
            const compareAtPrice = item.variant?.compareAtPrice ? Number(item.variant.compareAtPrice) : null;
            const lineTotal = Number((price * item.quantity).toFixed(2));
            const availableStock = item.variant?.inventory ? item.variant.inventory.availableQuantity : 0;
            const isAvailable = item.variant?.status === "ACTIVE" &&
                (!item.variant?.product || item.variant.product.status === "ACTIVE") &&
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
                    isLowStock: item.variant?.inventory ? availableStock <= (item.variant.inventory.reorderLevel ?? 5) : false,
                },
                product: {
                    id: item.variant?.product?.id,
                    name: item.variant?.product?.name ?? "Unknown Product",
                    slug: item.variant?.product?.slug,
                    thumbnail: item.variant?.product?.images?.[0]?.url ?? null,
                    category: item.variant?.product?.category ?? null,
                    brand: item.variant?.product?.brand ?? null,
                },
                variant: {
                    sku: item.variant?.sku,
                    barcode: item.variant?.barcode,
                    attributes: (item.variant?.attributeValues || []).map((av: any) => ({
                        attribute: av.attributeValue?.attribute?.name ?? "Attribute",
                        value: av.attributeValue?.value ?? "",
                    })),
                },
            };
        });

        return {
            id: cart.id,
            userId: cart.userId,
            createdAt: cart.createdAt,
            updatedAt: cart.updatedAt,
            summary: {
                itemCount: items.length,
                totalItems,
                subtotal: Number(subtotal.toFixed(2)),
                currency: "INR",
            },
            items,
        };
    }
}

export const cartSessionService = new CartSessionService();
