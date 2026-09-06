/**
 * OpenAPI / Swagger schemas for Inventory Management (Stock, Reservations, Transactions).
 */

export const inventoryTags = [
    {
        name: "Inventory - Stock & Reservations",
        description: "📦 Inventory: Stock levels, manual adjustments, immutable audit logs, reservations, and checkout simulation",
    },
];

export const inventorySchemas = {
    // ----------------------------------------------------
    // Stock Management Schemas
    // ----------------------------------------------------
    addStock: {
        type: "object",
        required: ["variantId", "quantity"],
        properties: {
            variantId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, description: "Units of stock to add" },
            note: { type: "string", description: "Reason or supplier note" },
            referenceType: { type: "string", description: "e.g., PURCHASE_ORDER, RESTOCK, RETURN" },
            referenceId: { type: "string", description: "External reference identifier" },
        },
    },

    removeStock: {
        type: "object",
        required: ["variantId", "quantity"],
        properties: {
            variantId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, description: "Units of stock to remove" },
            note: { type: "string", description: "Reason for stock removal (e.g. Damaged, Expired)" },
            referenceType: { type: "string", description: "e.g., DAMAGE, WRITE_OFF, SHRINKAGE" },
            referenceId: { type: "string", description: "External reference identifier" },
        },
    },

    adjustStock: {
        type: "object",
        required: ["variantId"],
        properties: {
            variantId: { type: "string", format: "uuid" },
            availableQuantity: { type: "integer", minimum: 0, description: "New exact available stock count" },
            reorderLevel: { type: ["integer", "null"], minimum: 0, description: "Low stock alert threshold" },
            note: { type: "string", description: "Audit adjustment note" },
        },
    },

    variantParams: {
        type: "object",
        required: ["variantId"],
        properties: {
            variantId: { type: "string", format: "uuid" },
        },
    },

    reservationParams: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", format: "uuid" },
        },
    },

    // ----------------------------------------------------
    // Reservation Schemas
    // ----------------------------------------------------
    reserveStock: {
        type: "object",
        required: ["variantId", "quantity"],
        properties: {
            variantId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1, description: "Number of units to hold for checkout" },
            orderId: { type: ["string", "null"], format: "uuid", description: "Associated order ID (if already initialized)" },
            expiresInMinutes: { type: "integer", minimum: 1, maximum: 1440, default: 15, description: "Reservation TTL in minutes" },
        },
    },

    confirmReservation: {
        type: "object",
        properties: {
            orderId: { type: "string", format: "uuid", description: "Order ID that completed payment" },
        },
    },

    releaseReservation: {
        type: "object",
        properties: {
            reason: { type: "string", description: "Reason for release (e.g., Payment cancelled, Timeout)" },
        },
    },

    // ----------------------------------------------------
    // Checkout & Payment Flow Simulation
    // ----------------------------------------------------
    simulateCheckout: {
        type: "object",
        required: ["variantId", "quantity"],
        properties: {
            variantId: { type: "string", format: "uuid" },
            quantity: { type: "integer", minimum: 1 },
            simulatePaymentSuccess: { type: "boolean", default: true, description: "True to simulate payment success (Confirm reservation), False for failure (Release reservation)" },
            holdMinutes: { type: "integer", default: 15, minimum: 1 },
        },
    },
};
