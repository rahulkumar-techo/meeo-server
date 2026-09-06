import { cartSessionService, type CartIdentity } from "./cartSession.service.js";
import { cartItemService } from "./cartItem.service.js";
import { cartMergeService } from "./cartMerge.service.js";
import type { AddCartItemInput, UpdateCartItemInput } from "../validations/cart.validation.js";

export { type CartIdentity } from "./cartSession.service.js";
export { cartSessionService } from "./cartSession.service.js";
export { cartItemService } from "./cartItem.service.js";
export { cartMergeService } from "./cartMerge.service.js";

/**
 * Unified CartService orchestrator delegating to modular domain services:
 * - cartSessionService: guest session, TTL, user cart resolution & expiration
 * - cartItemService: add, update, remove, clear items & inventory validation
 * - cartMergeService: transactional merge of guest cart to permanent user cart
 */
export class CartService {
    getOrCreateCart(identity: CartIdentity) {
        return cartSessionService.getOrCreateCart(identity);
    }

    async getCart(identity: CartIdentity) {
        const { cart, sessionId } = await cartSessionService.getOrCreateCart(identity);
        return {
            sessionId: cart.sessionId ?? sessionId,
            ...cartSessionService.formatCart(cart),
        };
    }

    addItem(identity: CartIdentity, input: AddCartItemInput) {
        return cartItemService.addItem(identity, input);
    }

    updateItemQuantity(identity: CartIdentity, itemId: string, input: UpdateCartItemInput) {
        return cartItemService.updateItemQuantity(identity, itemId, input);
    }

    removeItem(identity: CartIdentity, itemId: string) {
        return cartItemService.removeItem(identity, itemId);
    }

    clearCart(identity: CartIdentity) {
        return cartItemService.clearCart(identity);
    }

    mergeGuestCart(userId: string, guestSessionId: string) {
        return cartMergeService.mergeGuestCart(userId, guestSessionId);
    }

    cleanupExpiredCarts() {
        return cartSessionService.cleanupExpiredCarts();
    }
}

export const cartService = new CartService();
