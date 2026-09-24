import { z } from "zod";

/**
 * Zod validations for Shopping Cart operations.
 * All cart endpoints strictly require authentication.
 */

export const addCartItemSchema = z.object({
    variantId: z.string().uuid("Invalid variant ID format"),
    quantity: z.number().int().positive("Quantity must be at least 1").max(1000, "Maximum quantity per item is 1000").default(1),
});

export const updateCartItemSchema = z.object({
    quantity: z.number().int().min(0, "Quantity cannot be negative").max(1000, "Maximum quantity per item is 1000"),
});

export const cartItemParamSchema = z.object({
    itemId: z.string().uuid("Invalid cart item ID format"),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CartItemParamInput = z.infer<typeof cartItemParamSchema>;
