import { wishlistCoreService } from "./wishlistCore.service.js";
import { wishlistItemService } from "./wishlistItem.service.js";
import { wishlistTransferService } from "./wishlistTransfer.service.js";
import type { MoveToCartInput } from "../validations/wishlist.validation.js";

export { wishlistCoreService } from "./wishlistCore.service.js";
export { wishlistItemService } from "./wishlistItem.service.js";
export { wishlistTransferService } from "./wishlistTransfer.service.js";

/**
 * Unified WishlistService orchestrator delegating to modular domain services:
 * - wishlistCoreService: retrieval, auto-creation, formatting with variants and stock
 * - wishlistItemService: adding and removing wishlist items
 * - wishlistTransferService: moving products/variants directly to shopping cart
 */
export class WishlistService {
    getOrCreateWishlist(userId: string) {
        return wishlistCoreService.getOrCreateWishlist(userId);
    }

    getWishlist(userId: string) {
        return wishlistCoreService.getWishlist(userId);
    }

    addProduct(userId: string, productId: string) {
        return wishlistItemService.addProduct(userId, productId);
    }

    removeProduct(userId: string, productId: string) {
        return wishlistItemService.removeProduct(userId, productId);
    }

    moveToCart(userId: string, productId: string, input?: MoveToCartInput) {
        return wishlistTransferService.moveToCart(userId, productId, input);
    }
}

export const wishlistService = new WishlistService();
