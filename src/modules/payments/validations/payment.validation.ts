import { z } from "zod";

export const CreatePaymentIntentSchema = z.object({
    orderId: z.string().uuid({ message: "Invalid orderId format (UUID required)" }),
    provider: z.enum(["MOCK", "STRIPE", "RAZORPAY"]).default("MOCK"),
    paymentMethod: z.string().min(1).max(50).optional(),
    returnUrl: z.string().url().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

export type CreatePaymentIntentInput = z.infer<typeof CreatePaymentIntentSchema>;

export const RetryPaymentSchema = z.object({
    paymentId: z.string().uuid({ message: "Invalid paymentId format (UUID required)" }),
    paymentMethod: z.string().min(1).max(50).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
});

export type RetryPaymentInput = z.infer<typeof RetryPaymentSchema>;

export const CreateRefundSchema = z.object({
    paymentId: z.string().uuid({ message: "Invalid paymentId format (UUID required)" }),
    amount: z.number().positive({ message: "Refund amount must be greater than 0" }).optional(),
    reason: z.string().min(3).max(500).optional(),
});

export type CreateRefundInput = z.infer<typeof CreateRefundSchema>;

export const ReconcilePaymentSchema = z.object({
    paymentId: z.string().uuid({ message: "Invalid paymentId format (UUID required)" }),
});

export type ReconcilePaymentInput = z.infer<typeof ReconcilePaymentSchema>;

export const QueryPaymentsSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum([
        "PENDING",
        "PROCESSING",
        "REQUIRES_ACTION",
        "SUCCESS",
        "FAILED",
        "CANCELLED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
    ]).optional(),
    orderId: z.string().uuid().optional(),
    provider: z.string().optional(),
});

export type QueryPaymentsInput = z.infer<typeof QueryPaymentsSchema>;
