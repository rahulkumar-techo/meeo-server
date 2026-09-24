export const paymentSwaggerSchemas = {
    initializePayment: {
        type: "object",
        required: ["orderId"],
        properties: {
            orderId: { type: "string", format: "uuid", description: "Target order ID" },
            provider: { type: "string", enum: ["RAZORPAY", "STRIPE"], default: "RAZORPAY" },
            paymentMethod: { type: "string", description: "Card, UPI, Netbanking, etc." },
            returnUrl: { type: "string", format: "uri", description: "Redirect URL upon client completion" },
            metadata: { type: "object", description: "Custom gateway metadata" },
        },
    },

    verifyPayment: {
        type: "object",
        required: ["orderId", "razorpayOrderId", "razorpayPaymentId", "razorpaySignature"],
        properties: {
            orderId: { type: "string", format: "uuid", description: "Order ID to verify" },
            razorpayOrderId: { type: "string", description: "Razorpay Order ID" },
            razorpayPaymentId: { type: "string", description: "Razorpay Payment ID" },
            razorpaySignature: { type: "string", description: "Razorpay cryptographic signature" },
        },
    },

    recordPaymentFailure: {
        type: "object",
        required: ["orderId"],
        properties: {
            orderId: { type: "string", format: "uuid", description: "Order ID" },
            failureCode: { type: "string", description: "Gateway error code" },
            failureMessage: { type: "string", description: "Failure description or cancellation note" },
            providerPaymentId: { type: "string", description: "Razorpay Payment/Attempt ID if available" },
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
