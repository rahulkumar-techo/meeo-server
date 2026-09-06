import type { FastifyRequest, FastifyReply } from "fastify";
import { paymentService } from "../services/payment.service.js";
import {
    CreatePaymentIntentSchema,
    RetryPaymentSchema,
    CreateRefundSchema,
    ReconcilePaymentSchema,
    QueryPaymentsSchema,
} from "../validations/payment.validation.js";

export class PaymentController {
    /**
     * Initializes payment for an order.
     */
    async initializePayment(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.user as any)?.id;
        const parsed = CreatePaymentIntentSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                message: "Validation failed",
                errors: parsed.error.issues,
            });
        }

        const result = await paymentService.initializePayment(userId, parsed.data);
        return reply.status(201).send({
            success: true,
            message: "Payment session initialized successfully",
            data: result,
        });
    }

    /**
     * Retries a payment for an existing payment record.
     */
    async retryPayment(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.user as any)?.id;
        const parsed = RetryPaymentSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                message: "Validation failed",
                errors: parsed.error.issues,
            });
        }

        const result = await paymentService.retryPayment(userId, parsed.data);
        return reply.status(200).send({
            success: true,
            message: "Payment retry initiated",
            data: result,
        });
    }

    /**
     * Retrieves payment details by ID.
     */
    async getPayment(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.user as any)?.id;
        const { id } = request.params as { id: string };
        const result = await paymentService.getPaymentById(id, userId);

        return reply.status(200).send({
            success: true,
            data: result,
        });
    }

    /**
     * Processes a full or partial refund.
     */
    async processRefund(request: FastifyRequest, reply: FastifyReply) {
        const userId = (request.user as any)?.id;
        const parsed = CreateRefundSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                message: "Validation failed",
                errors: parsed.error.issues,
            });
        }

        const result = await paymentService.processRefund(userId, parsed.data);
        return reply.status(200).send({
            success: true,
            message: "Refund processed successfully",
            data: result,
        });
    }

    /**
     * Reconciles a payment against external provider.
     */
    async reconcilePayment(request: FastifyRequest, reply: FastifyReply) {
        const parsed = ReconcilePaymentSchema.safeParse(request.body);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                message: "Validation failed",
                errors: parsed.error.issues,
            });
        }

        const result = await paymentService.reconcilePayment(parsed.data.paymentId);
        return reply.status(200).send({
            success: true,
            message: "Payment reconciliation complete",
            data: result,
        });
    }

    /**
     * Lists payments with pagination (Admin).
     */
    async listPayments(request: FastifyRequest, reply: FastifyReply) {
        const parsed = QueryPaymentsSchema.safeParse(request.query);

        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                message: "Invalid query parameters",
                errors: parsed.error.issues,
            });
        }

        const result = await paymentService.listPayments(parsed.data);
        return reply.status(200).send({
            success: true,
            ...result,
        });
    }
}

export const paymentController = new PaymentController();
