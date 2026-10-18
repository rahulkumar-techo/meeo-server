import { z } from "zod";
import { isValidGstin } from "../constants/indianStates.js";

export const gstinSchema = z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => !val || isValidGstin(val), {
        message: "Invalid Indian GSTIN format (must be 15 alphanumeric characters beginning with a valid State Code)",
    });

export const taxQuoteItemSchema = z.object({
    productId: z.string().uuid("Invalid product ID"),
    variantId: z.string().uuid("Invalid variant ID").optional(),
    quantity: z.coerce.number().int().positive("Quantity must be positive"),
    unitPrice: z.coerce.number().min(0).optional(),
});

export const taxQuoteSchema = z.object({
    cartId: z.string().uuid("Invalid cart ID").optional(),
    shippingAddress: z.object({
        state: z.string().min(1, "State or State Code is required"),
        postalCode: z.string().optional(),
        country: z.string().optional().default("IN"),
    }),
    customerGstin: gstinSchema.nullable().optional(),
    items: z.array(taxQuoteItemSchema).optional(),
    couponCode: z.string().trim().optional(),
    totalDiscount: z.coerce.number().min(0).optional().default(0),
    shippingFee: z.coerce.number().min(0).optional().default(0),
    isFreeShipping: z.boolean().optional().default(false),
});

export const createTaxClassificationSchema = z.object({
    hsnCode: z.string().trim().min(2).max(8, "HSN code must be 2 to 8 digits"),
    description: z.string().trim().min(3, "Description is required"),
    category: z.string().trim().max(64).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateClassificationStatusSchema = z.object({
    verificationStatus: z.enum(["VERIFIED", "UNVERIFIED", "FLAGGED_FOR_REVIEW"]),
});

export const createGstRuleSchema = z.object({
    taxClassificationId: z.string().uuid().optional(),
    hsnCode: z.string().trim().min(2).max(8),
    taxTreatment: z.enum(["TAXABLE", "NIL_RATED", "EXEMPT", "ZERO_RATED", "NON_TAXABLE"]).default("TAXABLE"),
    cgstRate: z.coerce.number().min(0).max(100),
    sgstRate: z.coerce.number().min(0).max(100),
    igstRate: z.coerce.number().min(0).max(100),
    cessRate: z.coerce.number().min(0).max(100).optional().default(0),
    effectiveFrom: z.string().datetime({ offset: true }),
    effectiveTo: z.string().datetime({ offset: true }).nullable().optional(),
    notificationRef: z.string().trim().max(255).nullable().optional(),
    jurisdiction: z.string().trim().max(10).optional().default("IN"),
});

export const upsertSellerProfileSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    legalBusinessName: z.string().trim().min(2, "Legal business name is required"),
    tradeName: z.string().trim().min(2, "Trade name is required"),
    gstin: z.string().trim().toUpperCase().refine(isValidGstin, {
        message: "Invalid 15-character Indian GSTIN",
    }),
    stateCode: z.string().trim().min(1, "State code or name is required"),
    addressLine1: z.string().trim().min(3, "Address is required"),
    addressLine2: z.string().trim().nullable().optional(),
    city: z.string().trim().min(2, "City is required"),
    postalCode: z.string().trim().min(4, "Postal code is required"),
    registrationType: z.enum(["REGULAR", "COMPOSITION", "UNREGISTERED"]).optional().default("REGULAR"),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional().default("ACTIVE"),
    isDefaultPlatformSeller: z.boolean().optional().default(false),
});

export type TaxQuoteInput = z.infer<typeof taxQuoteSchema>;
export type CreateTaxClassificationInput = z.infer<typeof createTaxClassificationSchema>;
export type CreateGstRuleInputSchema = z.infer<typeof createGstRuleSchema>;
export type UpsertSellerProfileInputSchema = z.infer<typeof upsertSellerProfileSchema>;
