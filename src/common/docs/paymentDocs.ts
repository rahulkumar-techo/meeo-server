export const paymentSwaggerSchemas = {
    initializePayment: {
        type: "object",
        required: ["orderId"],
        properties: {
            orderId: { type: "string", format: "uuid", description: "Target order ID" },
            provider: { type: "string", enum: ["MOCK", "STRIPE", "RAZORPAY"], default: "MOCK" },
            paymentMethod: { type: "string", description: "Card, UPI, Netbanking, etc." },
            returnUrl: { type: "string", format: "uri", description: "Redirect URL upon client completion" },
            metadata: { type: "object", description: "Custom gateway metadata" },
        },
    },

    retryPayment: {
        type: "object",
        required: ["paymentId"],
        properties: {
            paymentId: { type: "string", format: "uuid", description: "Payment ID to retry" },
            paymentMethod: { type: "string", description: "New payment method if changing" },
            metadata: { type: "object", description: "Custom gateway metadata" },
        },
    },

    refundPayment: {
        type: "object",
        required: ["paymentId"],
        properties: {
            paymentId: { type: "string", format: "uuid", description: "Payment ID to refund" },
            amount: { type: "number", minimum: 0.01, description: "Refund amount (defaults to remaining full amount)" },
            reason: { type: "string", description: "Reason for refund" },
        },
    },

    reconcilePayment: {
        type: "object",
        required: ["paymentId"],
        properties: {
            paymentId: { type: "string", format: "uuid", description: "Payment ID to reconcile" },
        },
    },

    queryPayments: {
        type: "object",
        properties: {
            page: { type: "integer", default: 1 },
            limit: { type: "integer", default: 20 },
            status: {
                type: "string",
                enum: [
                    "PENDING",
                    "PROCESSING",
                    "REQUIRES_ACTION",
                    "SUCCESS",
                    "FAILED",
                    "CANCELLED",
                    "PARTIALLY_REFUNDED",
                    "REFUNDED",
                ],
            },
            orderId: { type: "string", format: "uuid" },
            provider: { type: "string" },
        },
    },
};
