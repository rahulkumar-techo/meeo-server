/**
 * Swagger documentation schemas and tags for Coupons & Promotions endpoints.
 */
export const couponTags = [
    {
        name: "Coupons & Promotions",
        description: "🏷️ Percentage, Fixed Amount, and Free Shipping Coupons, Minimum Order & Maximum Discount Rules, Usage Limits, and Auditing",
    },
];

export const couponSwaggerSchemas = {
    validateCoupon: {
        type: "object",
        required: ["code", "subtotal"],
        properties: {
            code: { type: "string", description: "Promotional coupon code (e.g., SAVE20, FREESHIP)" },
            subtotal: { type: "number", minimum: 0, description: "Cart/Order subtotal before discount" },
        },
    },

    createCoupon: {
        type: "object",
        required: ["code", "type", "value"],
        properties: {
            code: { type: "string", description: "Unique uppercase coupon code" },
            type: { type: "string", enum: ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"], description: "Discount calculation strategy" },
            value: { type: "number", minimum: 0, description: "Percentage value (1-100) or Fixed currency amount" },
            minimumOrderAmount: { type: "number", minimum: 0, description: "Minimum cart subtotal required to use coupon" },
            maximumDiscountAmount: { type: "number", minimum: 0, description: "Maximum dollar cap for percentage discounts" },
            usageLimit: { type: "integer", minimum: 1, description: "Maximum total global redemptions allowed" },
            usageLimitPerUser: { type: "integer", minimum: 1, description: "Maximum redemptions allowed per customer" },
            startsAt: { type: "string", format: "date-time", description: "Activation timestamp" },
            expiresAt: { type: "string", format: "date-time", description: "Expiration timestamp" },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"], default: "ACTIVE" },
        },
    },

    updateCoupon: {
        type: "object",
        properties: {
            code: { type: "string", description: "Unique coupon code" },
            type: { type: "string", enum: ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] },
            value: { type: "number", minimum: 0 },
            minimumOrderAmount: { type: "number", minimum: 0, nullable: true },
            maximumDiscountAmount: { type: "number", minimum: 0, nullable: true },
            usageLimit: { type: "integer", minimum: 1, nullable: true },
            usageLimitPerUser: { type: "integer", minimum: 1, nullable: true },
            startsAt: { type: "string", format: "date-time", nullable: true },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"] },
        },
    },

    toggleStatus: {
        type: "object",
        required: ["status"],
        properties: {
            status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"] },
        },
    },

    couponQuery: {
        type: "object",
        properties: {
            search: { type: "string", description: "Search by coupon code" },
            type: { type: "string", enum: ["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"] },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"] },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    usageQuery: {
        type: "object",
        properties: {
            couponId: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },
};
