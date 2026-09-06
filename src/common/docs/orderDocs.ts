/**
 * Fastify Swagger documentation schemas for Orders & Checkout module.
 */

export const orderTags = [
    {
        name: "Orders & Checkout",
        description: "🛍️ Transactional Checkout: Price & inventory validation, coupon discounts, order creation, item/address snapshots, and idempotency",
    },
];

const addressSnapshotSchema = {
    type: "object",
    required: ["recipientName", "addressLine1", "city", "state", "postalCode", "country"],
    properties: {
        recipientName: { type: "string", description: "Full recipient delivery name" },
        phone: { type: "string", description: "Contact telephone number" },
        addressLine1: { type: "string", description: "Street address, P.O. box, or company name" },
        addressLine2: { type: "string", description: "Apartment, suite, unit, or floor" },
        city: { type: "string", description: "City or town" },
        state: { type: "string", description: "State, province, or region" },
        postalCode: { type: "string", description: "ZIP or postal code" },
        country: { type: "string", description: "Country name or ISO code" },
        latitude: { type: "number" },
        longitude: { type: "number" },
    },
};

export const orderSwaggerSchemas = {
    addressSnapshot: addressSnapshotSchema,

    checkout: {
        type: "object",
        properties: {
            cartId: {
                type: "string",
                format: "uuid",
                description: "Optional specific cart UUID. If omitted, the user's active cart is resolved.",
            },
            shippingAddressId: {
                type: "string",
                format: "uuid",
                description: "UUID of a saved user delivery address",
            },
            shippingAddress: addressSnapshotSchema,
            billingAddressId: {
                type: "string",
                format: "uuid",
                description: "Optional saved billing address ID",
            },
            billingAddress: addressSnapshotSchema,
            couponCode: {
                type: "string",
                description: "Promotional coupon code for order discount",
            },
            notes: {
                type: "string",
                description: "Special delivery instructions or order notes",
            },
            currency: {
                type: "string",
                default: "USD",
                description: "3-letter ISO currency code",
            },
        },
    },

    updateStatus: {
        type: "object",
        required: ["status"],
        properties: {
            status: {
                type: "string",
                enum: [
                    "PENDING",
                    "PAYMENT_PENDING",
                    "CONFIRMED",
                    "PROCESSING",
                    "SHIPPED",
                    "DELIVERED",
                    "CANCELLED",
                    "EXPIRED",
                    "REFUNDED",
                ],
                description: "New order status",
            },
            reason: {
                type: "string",
                description: "Reason or note for status transition",
            },
        },
    },

    cancelOrder: {
        type: "object",
        properties: {
            reason: {
                type: "string",
                description: "Reason for cancellation",
            },
        },
    },

    orderIdParam: {
        type: "object",
        required: ["id"],
        properties: {
            id: {
                type: "string",
                format: "uuid",
                description: "Order UUID",
            },
        },
    },

    orderNumberParam: {
        type: "object",
        required: ["orderNumber"],
        properties: {
            orderNumber: {
                type: "string",
                description: "Unique order reference number (e.g. ORD-20260906-AB123)",
            },
        },
    },

    orderQuery: {
        type: "object",
        properties: {
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
            status: {
                type: "string",
                enum: [
                    "PENDING",
                    "PAYMENT_PENDING",
                    "CONFIRMED",
                    "PROCESSING",
                    "SHIPPED",
                    "DELIVERED",
                    "CANCELLED",
                    "EXPIRED",
                    "REFUNDED",
                ],
            },
            search: { type: "string" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
        },
    },
};
