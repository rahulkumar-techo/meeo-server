import { z } from "zod";

/**
 * Base Zod validation schema for promotion attributes.
 */
export const basePromotionSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(100),
    slug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
    description: z.string().max(1000).optional().nullable(),
    code: z.string().min(3).max(50).trim().transform((val) => val.toUpperCase()).optional().nullable(),
    type: z.enum([
        "PERCENTAGE",
        "FIXED_DISCOUNT",
        "BUY_X_GET_Y",
        "FREE_SHIPPING",
        "PRODUCT_DISCOUNT",
        "CATEGORY_DISCOUNT",
        "BRAND_DISCOUNT",
        "FLASH_SALE",
    ]),
    status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]).default("DRAFT"),
    priority: z.coerce.number().int().min(0).default(0),
    isStackable: z.boolean().default(false),
    stackingRule: z.enum(["EXCLUSIVE", "STACKABLE_WITH_OTHERS", "STACKABLE_WITH_COUPONS"]).default("EXCLUSIVE"),
    isAutomatic: z.boolean().default(false),
    customerSegment: z.enum(["ALL", "FIRST_TIME_BUYER", "VIP", "RETURNING", "REGISTERED"]).default("ALL"),
    firstOrderOnly: z.boolean().default(false),

    discountValue: z.coerce.number().min(0).optional().nullable(),
    maxDiscountAmount: z.coerce.number().min(0).optional().nullable(),
    minOrderSubtotal: z.coerce.number().min(0).optional().nullable(),
    minQuantity: z.coerce.number().int().min(1).optional().nullable(),

    buyXQuantity: z.coerce.number().int().min(1).optional().nullable(),
    getYQuantity: z.coerce.number().int().min(1).optional().nullable(),
    getYDiscountPercentage: z.coerce.number().min(0).max(100).optional().nullable(),

    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    timeOfDayStart: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format HH:mm").optional().nullable(),
    timeOfDayEnd: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format HH:mm").optional().nullable(),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).default([]),

    totalUsageLimit: z.coerce.number().int().min(1).optional().nullable(),
    userUsageLimit: z.coerce.number().int().min(1).optional().nullable(),

    targetProductIds: z.array(z.string().uuid()).default([]),
    targetCategoryIds: z.array(z.string().uuid()).default([]),
    targetBrandIds: z.array(z.string().uuid()).default([]),
    excludedProductIds: z.array(z.string().uuid()).default([]),
    excludedCategoryIds: z.array(z.string().uuid()).default([]),

    metadata: z.record(z.string(), z.any()).optional().nullable(),
});

/**
 * Validation schema for creating a new promotional campaign.
 */
export const createPromotionSchema = basePromotionSchema.refine(
    (data) => {
        if (data.startsAt && data.endsAt) {
            return new Date(data.startsAt) <= new Date(data.endsAt);
        }
        return true;
    },
    { message: "endsAt must be greater than or equal to startsAt", path: ["endsAt"] }
).refine(
    (data) => {
        if (["PERCENTAGE", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT", "BRAND_DISCOUNT", "FLASH_SALE"].includes(data.type)) {
            if (data.discountValue !== undefined && data.discountValue !== null) {
                return data.discountValue > 0 && data.discountValue <= 100;
            }
        }
        return true;
    },
    { message: "Percentage discountValue must be between 0.01 and 100", path: ["discountValue"] }
).refine(
    (data) => {
        if (data.type === "BUY_X_GET_Y") {
            return !!data.buyXQuantity && !!data.getYQuantity;
        }
        return true;
    },
    { message: "BUY_X_GET_Y promotions require both buyXQuantity and getYQuantity", path: ["buyXQuantity"] }
);

/**
 * Validation schema for updating an existing promotion.
 */
export const updatePromotionSchema = basePromotionSchema.partial();

/**
 * Query filters for listing promotions.
 */
export const promotionQuerySchema = z.object({
    search: z.string().trim().optional(),
    type: z.enum([
        "PERCENTAGE",
        "FIXED_DISCOUNT",
        "BUY_X_GET_Y",
        "FREE_SHIPPING",
        "PRODUCT_DISCOUNT",
        "CATEGORY_DISCOUNT",
        "BRAND_DISCOUNT",
        "FLASH_SALE",
    ]).optional(),
    status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]).optional(),
    isAutomatic: z.coerce.boolean().optional(),
    customerSegment: z.enum(["ALL", "FIRST_TIME_BUYER", "VIP", "RETURNING", "REGISTERED"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["createdAt", "priority", "startsAt", "endsAt", "name"]).default("priority"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Schema for customer/admin preview evaluation of cart items.
 */
export const previewPromotionSchema = z.object({
    promoCode: z.string().trim().optional().nullable(),
    shippingFee: z.coerce.number().min(0).default(0),
    items: z.array(
        z.object({
            productId: z.string().uuid(),
            variantId: z.string().uuid().optional().nullable(),
            categoryId: z.string().uuid().optional().nullable(),
            brandId: z.string().uuid().optional().nullable(),
            productName: z.string().min(1),
            unitPrice: z.coerce.number().min(0),
            quantity: z.coerce.number().int().min(1),
        })
    ).min(1, "Cart must contain at least one item"),
});

/**
 * Schema for validating a promotion code directly.
 */
export const validatePromoCodeSchema = z.object({
    code: z.string().min(1, "Code is required").trim().transform((val) => val.toUpperCase()),
    subtotal: z.coerce.number().min(0),
});

/**
 * Schema for updating promotion status (publish, pause, archive).
 */
export const togglePromotionStatusSchema = z.object({
    status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type PromotionQueryInput = z.infer<typeof promotionQuerySchema>;
export type PreviewPromotionInput = z.infer<typeof previewPromotionSchema>;
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>;
export type TogglePromotionStatusInput = z.infer<typeof togglePromotionStatusSchema>;
