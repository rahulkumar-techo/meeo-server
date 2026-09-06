import { prisma } from "@/lib/prisma.js";
import { cartSessionService } from "./cartSession.service.js";

export class CartMergeService {
    /**
     * Merges a guest cart into an authenticated user's cart upon login/registration.
     */
    async mergeGuestCart(userId: string, guestSessionId: string) {
        if (!guestSessionId) {
            const { cart } = await cartSessionService.getOrCreateCart({ userId });
            return {
                sessionId: undefined,
                ...cartSessionService.formatCart(cart),
            };
        }

        // Find guest cart
        const guestCart = await prisma.cart.findFirst({
            where: { sessionId: guestSessionId },
            include: {
                items: {
                    include: {
                        variant: {
                            include: { inventory: true },
                        },
                    },
                },
            },
        });

        if (!guestCart || guestCart.items.length === 0) {
            const { cart } = await cartSessionService.getOrCreateCart({ userId });
            return {
                sessionId: undefined,
                ...cartSessionService.formatCart(cart),
            };
        }

        // Find or create user cart
        const { cart: userCart } = await cartSessionService.getOrCreateCart({ userId });

        // Merge items within transaction
        await prisma.$transaction(async (tx) => {
            for (const guestItem of guestCart.items) {
                const availableStock = guestItem.variant.inventory
                    ? guestItem.variant.inventory.availableQuantity
                    : guestItem.quantity;

                const existingUserItem = await tx.cartItem.findUnique({
                    where: {
                        cartId_variantId: {
                            cartId: userCart.id,
                            variantId: guestItem.variantId,
                        },
                    },
                });

                if (existingUserItem) {
                    const combinedQty = Math.min(
                        existingUserItem.quantity + guestItem.quantity,
                        availableStock > 0 ? availableStock : existingUserItem.quantity + guestItem.quantity,
                    );

                    await tx.cartItem.update({
                        where: { id: existingUserItem.id },
                        data: { quantity: Math.max(1, combinedQty) },
                    });
                } else {
                    const targetQty = Math.min(
                        guestItem.quantity,
                        availableStock > 0 ? availableStock : guestItem.quantity,
                    );
                    if (targetQty > 0) {
                        await tx.cartItem.create({
                            data: {
                                cartId: userCart.id,
                                variantId: guestItem.variantId,
                                quantity: targetQty,
                            },
                        });
                    }
                }
            }

            // Remove merged guest cart
            await tx.cart.delete({
                where: { id: guestCart.id },
            });
        });

        const updatedUserCart = await prisma.cart.findUnique({
            where: { id: userCart.id },
            include: cartSessionService.getCartInclude(),
        });

        return {
            sessionId: undefined,
            ...cartSessionService.formatCart(updatedUserCart ?? userCart),
        };
    }
}

export const cartMergeService = new CartMergeService();
