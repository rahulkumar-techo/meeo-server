import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { paymentProviderRegistry } from "../providers/paymentProvider.registry.js";
import { paymentAttemptService } from "./paymentAttempt.service.js";
import type { CreatePaymentIntentInput, RetryPaymentInput } from "../validations/payment.validation.js";

export class PaymentCreationService {
    /**
     * Initializes a payment session and gateway intent for an order.
     */
    async initializePayment(userId?: string, input?: CreatePaymentIntentInput) {
        if (!input?.orderId) {
            throw new AppError("Order ID is required to initialize payment", 400);
        }

        // 1. Fetch and validate order
        const order = await prisma.order.findUnique({
            where: { id: input.orderId },
            include: {
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
                address: true,
            },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        // Customer permission check: if authenticated, must match order userId
        if (userId && order.userId && order.userId !== userId) {
            throw new AppError("Forbidden: You cannot initialize payment for another user's order", 403);
        }

        // Order state check
        if (order.status !== "PENDING" && order.status !== "PAYMENT_PENDING") {
            throw new AppError(
                `Cannot create payment for order in "${order.status}" status. Order must be PENDING or PAYMENT_PENDING`,
                400,
            );
        }

        const providerName = input.provider || "MOCK";
        const provider = paymentProviderRegistry.getProvider(providerName);
        const amount = Number(order.grandTotal);
        const currency = order.currency;

        // 2. Resolve or create Payment entity
        let payment = await prisma.payment.findFirst({
            where: {
                orderId: order.id,
                status: { in: ["PENDING", "PROCESSING", "REQUIRES_ACTION"] },
            },
        });

        if (!payment) {
            payment = await prisma.payment.create({
                data: {
                    orderId: order.id,
                    provider: providerName,
                    paymentMethod: input.paymentMethod ?? null,
                    status: "PENDING",
                    currency,
                    amount,
                    metadata: (input.metadata ?? {}) as any,
                },
            });
        }

        // 3. Delegate to payment gateway provider
        const customerName = order.user
            ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim()
            : order.address?.recipientName;

        const gatewayIntent = await provider.createPaymentIntent({
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount,
            currency,
            paymentMethod: input.paymentMethod,
            customerEmail: order.user?.email || undefined,
            customerName: customerName || undefined,
            returnUrl: input.returnUrl,
            metadata: {
                paymentId: payment.id,
                orderId: order.id,
                orderNumber: order.orderNumber,
                ...(input.metadata || {}),
            },
        });

        // 4. Create initial PaymentAttempt
        const attempt = await paymentAttemptService.createNextAttempt({
            paymentId: payment.id,
            amount,
            providerPaymentId: gatewayIntent.providerPaymentId,
            status: "PROCESSING",
        });

        // 5. Update Order status to PAYMENT_PENDING if currently PENDING
        if (order.status === "PENDING") {
            await prisma.$transaction([
                prisma.order.update({
                    where: { id: order.id },
                    data: { status: "PAYMENT_PENDING" },
                }),
                prisma.orderStatusHistory.create({
                    data: {
                        orderId: order.id,
                        previousStatus: "PENDING",
                        newStatus: "PAYMENT_PENDING",
                        changedBy: userId ?? null,
                        reason: `Payment initiated via ${providerName}`,
                    },
                }),
            ]);
        }

        return {
            paymentId: payment.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: providerName,
            providerPaymentId: gatewayIntent.providerPaymentId,
            clientSecret: gatewayIntent.clientSecret,
            checkoutUrl: gatewayIntent.checkoutUrl,
            status: payment.status,
            attemptNumber: attempt.attemptNumber,
            amount,
            currency,
        };
    }

    /**
     * Retries a payment attempt on an existing pending/failed payment.
     */
    async retryPayment(userId?: string, input?: RetryPaymentInput) {
        if (!input?.paymentId) {
            throw new AppError("Payment ID is required to retry payment", 400);
        }

        const payment = await prisma.payment.findUnique({
            where: { id: input.paymentId },
            include: {
                order: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true } },
                        address: true,
                    },
                },
            },
        });

        if (!payment) {
            throw new AppError("Payment record not found", 404);
        }

        if (userId && payment.order.userId && payment.order.userId !== userId) {
            throw new AppError("Forbidden: You cannot retry payment for another user's order", 403);
        }

        if (payment.status === "SUCCESS" || payment.status === "REFUNDED") {
            throw new AppError(`Cannot retry payment with status "${payment.status}"`, 400);
        }

        const provider = paymentProviderRegistry.getProvider(payment.provider);
        const amount = Number(payment.amount);

        const customerName = payment.order.user
            ? `${payment.order.user.firstName || ""} ${payment.order.user.lastName || ""}`.trim()
            : payment.order.address?.recipientName;

        // Create new gateway intent / token
        const gatewayIntent = await provider.createPaymentIntent({
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            amount,
            currency: payment.currency,
            paymentMethod: input.paymentMethod || payment.paymentMethod || undefined,
            customerEmail: payment.order.user?.email || undefined,
            customerName: customerName || undefined,
            metadata: {
                paymentId: payment.id,
                orderId: payment.orderId,
                orderNumber: payment.order.orderNumber,
                isRetry: true,
                ...(input.metadata || {}),
            },
        });

        // Record next attempt
        const attempt = await paymentAttemptService.createNextAttempt({
            paymentId: payment.id,
            amount,
            providerPaymentId: gatewayIntent.providerPaymentId,
            status: "PROCESSING",
        });

        // Reset payment status to PROCESSING
        await prisma.payment.update({
            where: { id: payment.id },
            data: { status: "PROCESSING" },
        });

        return {
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            provider: payment.provider,
            providerPaymentId: gatewayIntent.providerPaymentId,
            clientSecret: gatewayIntent.clientSecret,
            checkoutUrl: gatewayIntent.checkoutUrl,
            status: "PROCESSING",
            attemptNumber: attempt.attemptNumber,
            amount,
            currency: payment.currency,
        };
    }
}

export const paymentCreationService = new PaymentCreationService();
