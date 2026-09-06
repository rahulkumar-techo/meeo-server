import { z } from "zod";

/**
 * Zod validation schemas for Checkout & Order Management.
 */

export const addressSnapshotSchema = z.object({
    recipientName: z.string().trim().min(1, "Recipient name is required").max(100),
    phone: z.string().trim().max(30).optional(),
    addressLine1: z.string().trim().min(1, "Address line 1 is required").max(255),
    addressLine2: z.string().trim().max(255).optional(),
    city: z.string().trim().min(1, "City is required").max(100),
    state: z.string().trim().min(1, "State/Province is required").max(100),
    postalCode: z.string().trim().min(1, "Postal code is required").max(20),
    country: z.string().trim().min(1, "Country is required").max(100),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
});

export const checkoutSchema = z.object({
    cartId: z.string().uuid("Invalid cart ID format").optional(),
    shippingAddressId: z.string().uuid("Invalid shipping address ID format").optional(),
    shippingAddress: addressSnapshotSchema.optional(),
    billingAddressId: z.string().uuid("Invalid billing address ID format").optional(),
    billingAddress: addressSnapshotSchema.optional(),
    couponCode: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(500).optional(),
    currency: z.string().trim().length(3, "Currency must be a 3-letter ISO code").default("USD"),
}).refine(
    (data) => !!data.shippingAddressId || !!data.shippingAddress,
    {
        message: "Either shippingAddressId or an inline shippingAddress must be provided",
        path: ["shippingAddressId"],
    },
);

export const validateCheckoutSchema = checkoutSchema;

export const orderStatusUpdateSchema = z.object({
    status: z.enum([
        "PENDING",
        "PAYMENT_PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
    ]),
    reason: z.string().trim().max(500).optional(),
});

export const orderCancelSchema = z.object({
    reason: z.string().trim().max(500).optional(),
});

export const orderQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum([
        "PENDING",
        "PAYMENT_PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "EXPIRED",
        "REFUNDED",
    ]).optional(),
    search: z.string().trim().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

export const orderIdParamSchema = z.object({
    id: z.string().uuid("Invalid order ID format"),
});

export const orderNumberParamSchema = z.object({
    orderNumber: z.string().trim().min(1, "Order number is required"),
});

export type AddressSnapshotInput = z.infer<typeof addressSnapshotSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
export type OrderCancelInput = z.infer<typeof orderCancelSchema>;
export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
export type OrderIdParamInput = z.infer<typeof orderIdParamSchema>;
export type OrderNumberParamInput = z.infer<typeof orderNumberParamSchema>;
