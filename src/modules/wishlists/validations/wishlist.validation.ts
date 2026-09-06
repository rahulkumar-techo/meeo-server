import { z } from "zod";

/**
 * Zod validations for Wishlist operations.
 */

export const addWishlistItemSchema = z.object({
    productId: z.string().uuid("Invalid product ID format"),
});

export const wishlistProductParamSchema = z.object({
    productId: z.string().uuid("Invalid product ID format"),
});

export const moveToCartSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format").optional(),
    quantity: z.number().int().positive("Quantity must be at least 1").default(1),
});

export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
export type WishlistProductParamInput = z.infer<typeof wishlistProductParamSchema>;
export type MoveToCartInput = z.infer<typeof moveToCartSchema>;
