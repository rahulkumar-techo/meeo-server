import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import {
    cartSessionService,
    GUEST_CART_EXPIRATION_DAYS,
    type CartIdentity,
} from "./cartSession.service.js";
import type { AddCartItemInput, UpdateCartItemInput } from "../validations/cart.validation.js";

export class CartItemService {
    /**
     * Adds an item / variant to the cart with inventory availability validation.
     */
    async addItem(identity: CartIdentity, input: AddCartItemInput) {
        const { cart, sessionId } = await cartSessionService.getOrCreateCart(identity);

        const variant = await prisma.productVariant.findUnique({
            where: { id: input.variantId },
            include: {
                product: true,
                inventory: true,
            },
        });

        if (!variant || variant.status !== "ACTIVE" || (variant.product && variant.product.status !== "ACTIVE")) {
            throw new AppError("Product variant is inactive or unavailable", 400);
        }

        const availableStock = variant.inventory ? variant.inventory.availableQuantity : 0;
        if (availableStock <= 0) {
            throw new AppError(`Item "${variant.product?.name ?? variant.sku}" is currently out of stock`, 400);
        }

        const existingItem = await prisma.cartItem.findUnique({
            where: {
                cartId_variantId: {
                    cartId: cart.id,
                    variantId: input.variantId,
                },
            },
        });

        const newQuantity = existingItem ? existingItem.quantity + input.quantity : input.quantity;

        if (newQuantity > availableStock) {
            throw new AppError(
                `Requested total quantity (${newQuantity}) exceeds available stock (${availableStock}) for "${variant.product?.name ?? variant.sku}"`,
                400,
            );
        }

        if (existingItem) {
            await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: newQuantity },
            });
        } else {
            await prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    variantId: input.variantId,
                    quantity: input.quantity,
                },
            });
        }

        if (cart.sessionId) {
            await prisma.cart.update({
                where: { id: cart.id },
                data: {
                    expiresAt: new Date(Date.now() + GUEST_CART_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
                },
            });
        }

        const updatedCart = await prisma.cart.findUnique({
            where: { id: cart.id },
            include: cartSessionService.getCartInclude(),
        });

        return {
            sessionId: updatedCart?.sessionId ?? sessionId,
            ...cartSessionService.formatCart(updatedCart!),
        };
    }

    /**
     * Updates an existing item's quantity in the cart.
     */
    async updateItemQuantity(identity: CartIdentity, itemId: string, input: UpdateCartItemInput) {
        const { cart, sessionId } = await cartSessionService.getOrCreateCart(identity);

        const item = await prisma.cartItem.findFirst({
            where: {
                id: itemId,
                cartId: cart.id,
            },
            include: {
                variant: {
                    include: {
                        product: true,
                        inventory: true,
                    },
                },
            },
        });

        if (!item) {
            throw new AppError("Cart item not found", 404);
        }

        if (input.quantity <= 0) {
            await prisma.cartItem.delete({
                where: { id: item.id },
            });
        } else {
            const availableStock = item.variant.inventory ? item.variant.inventory.availableQuantity : 0;
            if (input.quantity > availableStock) {
                throw new AppError(
                    `Requested quantity (${input.quantity}) exceeds available stock (${availableStock})`,
                    400,
                );
            }

            await prisma.cartItem.update({
                where: { id: item.id },
                data: { quantity: input.quantity },
            });
        }

        const updatedCart = await prisma.cart.findUnique({
            where: { id: cart.id },
            include: cartSessionService.getCartInclude(),
        });

        return {
            sessionId: updatedCart?.sessionId ?? sessionId,
            ...cartSessionService.formatCart(updatedCart!),
        };
    }

    /**
     * Removes an item from the cart.
     */
    async removeItem(identity: CartIdentity, itemId: string) {
        const { cart, sessionId } = await cartSessionService.getOrCreateCart(identity);

        const item = await prisma.cartItem.findFirst({
            where: {
                id: itemId,
                cartId: cart.id,
            },
        });

        if (!item) {
            throw new AppError("Cart item not found in your cart", 404);
        }

        await prisma.cartItem.delete({
            where: { id: item.id },
        });

        const updatedCart = await prisma.cart.findUnique({
            where: { id: cart.id },
            include: cartSessionService.getCartInclude(),
        });

        return {
            sessionId: updatedCart?.sessionId ?? sessionId,
            ...cartSessionService.formatCart(updatedCart!),
        };
    }

    /**
     * Clears all items in the cart.
     */
    async clearCart(identity: CartIdentity) {
        const { cart, sessionId } = await cartSessionService.getOrCreateCart(identity);

        await prisma.cartItem.deleteMany({
            where: { cartId: cart.id },
        });

        const updatedCart = await prisma.cart.findUnique({
            where: { id: cart.id },
            include: cartSessionService.getCartInclude(),
        });

        return {
            sessionId: updatedCart?.sessionId ?? sessionId,
            ...cartSessionService.formatCart(updatedCart!),
        };
    }
}

export const cartItemService = new CartItemService();
