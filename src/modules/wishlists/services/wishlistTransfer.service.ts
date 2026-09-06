import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { cartService } from "@/modules/cart/services/cart.service.js";
import { wishlistItemService } from "./wishlistItem.service.js";
import type { MoveToCartInput } from "../validations/wishlist.validation.js";

export class WishlistTransferService {
    /**
     * Moves a wishlist product into the user's shopping cart.
     */
    async moveToCart(userId: string, productId: string, input?: MoveToCartInput) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                variants: {
                    where: { status: "ACTIVE" },
                    include: { inventory: true },
                },
            },
        });

        if (!product || product.status !== "ACTIVE" || product.deletedAt) {
            throw new AppError("Product is not available for purchase", 400);
        }

        let targetVariant = product.variants.find((v) => v.id === input?.variantId);

        if (!targetVariant) {
            targetVariant = product.variants.find(
                (v) => (v.inventory?.availableQuantity ?? 0) > 0,
            ) || product.variants[0];
        }

        if (!targetVariant) {
            throw new AppError("No active purchasable variant available for this product", 400);
        }

        const quantity = input?.quantity ?? 1;

        // Add to cart using cartService
        const cart = await cartService.addItem({ userId }, {
            variantId: targetVariant.id,
            quantity,
        });

        // Remove from wishlist
        await wishlistItemService.removeProduct(userId, productId).catch(() => {
            // Ignore if already removed
        });

        return {
            message: `Moved "${product.name}" to cart successfully`,
            addedVariantId: targetVariant.id,
            cart,
        };
    }
}

export const wishlistTransferService = new WishlistTransferService();
