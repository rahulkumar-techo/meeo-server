import { z } from "zod";

/**
 * Validation schema for creating a new promotional coupon.
 */
export const createCouponSchema = z.object({
    code: z
        .string()
        .min(3, "Coupon code must be at least 3 characters")
        .max(50, "Coupon code cannot exceed 50 characters")
        .trim()
        .transform((val) => val.toUpperCase()),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
    value: z.coerce
        .number()
        .min(0, "Coupon discount value must be greater than or equal to 0"),
    minimumOrderAmount: z.coerce
        .number()
        .min(0, "Minimum order amount must be non-negative")
        .optional()
        .nullable(),
    maximumDiscountAmount: z.coerce
        .number()
        .min(0, "Maximum discount amount must be non-negative")
        .optional()
        .nullable(),
    usageLimit: z.coerce
        .number()
        .int("Usage limit must be an integer")
        .min(1, "Usage limit must be at least 1")
        .optional()
        .nullable(),
    usageLimitPerUser: z.coerce
        .number()
        .int("Per-user limit must be an integer")
        .min(1, "Per-user limit must be at least 1")
        .optional()
        .nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).default("ACTIVE"),
}).refine(
    (data) => {
        if (data.type === "PERCENTAGE" && (data.value < 1 || data.value > 100)) {
            return false;
        }
        return true;
    },
    {
        message: "Percentage coupon value must be between 1 and 100",
        path: ["value"],
    },
).refine(
    (data) => {
        if (data.startsAt && data.expiresAt) {
            return new Date(data.startsAt) < new Date(data.expiresAt);
        }
        return true;
    },
    {
        message: "Expiration date must be after start date",
        path: ["expiresAt"],
    },
);

/**
 * Validation schema for updating an existing coupon.
 */
export const updateCouponSchema = z.object({
    code: z
        .string()
        .min(3)
        .max(50)
        .trim()
        .transform((val) => val.toUpperCase())
        .optional(),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]).optional(),
    value: z.coerce.number().min(0).optional(),
    minimumOrderAmount: z.coerce.number().min(0).optional().nullable(),
    maximumDiscountAmount: z.coerce.number().min(0).optional().nullable(),
    usageLimit: z.coerce.number().int().min(1).optional().nullable(),
    usageLimitPerUser: z.coerce.number().int().min(1).optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).optional(),
}).refine(
    (data) => {
        if (data.type === "PERCENTAGE" && data.value !== undefined && (data.value < 1 || data.value > 100)) {
            return false;
        }
        return true;
    },
    {
        message: "Percentage coupon value must be between 1 and 100",
        path: ["value"],
    },
);

/**
 * Schema for customer previewing / validating a coupon for a checkout subtotal.
 */
export const validateCouponSchema = z.object({
    code: z.string().min(1, "Coupon code is required").trim().transform((val) => val.toUpperCase()),
    subtotal: z.coerce.number().min(0, "Subtotal must be non-negative"),
});

/**
 * Schema for querying coupons with search, status filter, and pagination.
 */
export const couponQuerySchema = z.object({
    search: z.string().trim().optional(),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Schema for querying coupon usage history.
 */
export const couponUsageQuerySchema = z.object({
    couponId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Schema for toggling coupon status.
 */
export const toggleCouponStatusSchema = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type CouponQueryInput = z.infer<typeof couponQuerySchema>;
export type CouponUsageQueryInput = z.infer<typeof couponUsageQuerySchema>;
export type ToggleCouponStatusInput = z.infer<typeof toggleCouponStatusSchema>;
