import { cartSessionService } from "./cartSession.service.js";
import { cartItemService } from "./cartItem.service.js";
import type { AddCartItemInput, UpdateCartItemInput } from "../validations/cart.validation.js";

export { cartSessionService } from "./cartSession.service.js";
export { cartItemService } from "./cartItem.service.js";

/**
 * CartService orchestrator for authenticated shopping bag management:
 * - cartSessionService: user cart resolution & formatting
 * - cartItemService: add, update, remove, clear items & inventory validation
 */
export class CartService {
    getOrCreateCart(userId: string) {
        return cartSessionService.getOrCreateCart(userId);
    }

    async getCart(userId: string) {
        const cart = await cartSessionService.getOrCreateCart(userId);
        return cartSessionService.formatCart(cart);
    }

    addItem(userId: string, input: AddCartItemInput) {
        return cartItemService.addItem(userId, input);
    }

    updateItemQuantity(userId: string, itemId: string, input: UpdateCartItemInput) {
        return cartItemService.updateItemQuantity(userId, itemId, input);
    }

    removeItem(userId: string, itemId: string) {
        return cartItemService.removeItem(userId, itemId);
    }

    clearCart(userId: string) {
        return cartItemService.clearCart(userId);
    }
}

export const cartService = new CartService();
