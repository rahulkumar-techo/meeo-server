import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { paymentProviderRegistry } from "../providers/paymentProvider.registry.js";
import type { CreateRefundInput } from "../validations/payment.validation.js";

export class PaymentRefundService {
    /**
     * Issues a full or partial refund for a successful payment.
     */
    async processRefund(userId?: string, input?: CreateRefundInput) {
        if (!input?.paymentId) {
            throw new AppError("Payment ID is required to process refund", 400);
        }

        const payment = await prisma.payment.findUnique({
            where: { id: input.paymentId },
            include: { order: true, attempts: { where: { status: "SUCCESS" }, take: 1 } },
        });

        if (!payment) {
            throw new AppError("Payment record not found", 404);
        }

        if (payment.status !== "SUCCESS" && payment.status !== "PARTIALLY_REFUNDED") {
            throw new AppError(`Cannot refund payment in "${payment.status}" status. Only SUCCESS or PARTIALLY_REFUNDED payments can be refunded.`, 400);
        }

        const paidAmount = Number(payment.paidAmount);
        const alreadyRefunded = Number(payment.refundedAmount);
        const maxRefundable = Number((paidAmount - alreadyRefunded).toFixed(2));

        if (maxRefundable <= 0) {
            throw new AppError("Payment is already fully refunded", 400);
        }

        const refundAmount = input.amount !== undefined ? Number(input.amount.toFixed(2)) : maxRefundable;

        if (refundAmount <= 0) {
            throw new AppError("Refund amount must be greater than 0", 400);
        }

        if (refundAmount > maxRefundable) {
            throw new AppError(
                `Requested refund amount (${refundAmount}) exceeds refundable balance (${maxRefundable})`,
                400,
            );
        }

        const provider = paymentProviderRegistry.getProvider(payment.provider);
        const successfulAttempt = payment.attempts?.[0];
        const providerPaymentId = successfulAttempt?.providerPaymentId || payment.id;

        // 1. Execute external refund via provider gateway
        const refundResult = await provider.createRefund({
            paymentId: payment.id,
            providerPaymentId,
            amount: refundAmount,
            currency: payment.currency,
            reason: input.reason ?? undefined,
        });

        // 2. Persist refund transaction atomically
        const newRefundedTotal = Number((alreadyRefunded + refundAmount).toFixed(2));
        const isFullyRefunded = newRefundedTotal >= paidAmount;
        const newPaymentStatus = isFullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED";

        const { refund } = await prisma.$transaction(async (tx) => {
            // A. Create Refund entity
            const createdRefund = await tx.refund.create({
                data: {
                    paymentId: payment.id,
                    amount: refundAmount,
                    currency: payment.currency,
                    reason: input.reason ?? null,
                    status: "SUCCESS",
                    providerRefundId: refundResult.providerRefundId,
                    requestedBy: userId ?? null,
                    completedAt: new Date(),
                },
            });

            // B. Record REFUND PaymentTransaction
            await tx.paymentTransaction.create({
                data: {
                    paymentId: payment.id,
                    paymentAttemptId: successfulAttempt?.id ?? null,
                    type: "REFUND",
                    status: "SUCCESS",
                    amount: refundAmount,
                    currency: payment.currency,
                    providerTransactionId: refundResult.providerRefundId,
                    providerResponse: (refundResult.rawResponse ?? null) as any,
                },
            });

            // C. Update Payment entity
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    refundedAmount: newRefundedTotal,
                    status: newPaymentStatus,
                },
            });

            // D. If fully refunded, update Order status to REFUNDED
            if (isFullyRefunded && payment.order) {
                await tx.order.update({
                    where: { id: payment.orderId },
                    data: { status: "REFUNDED" },
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: payment.orderId,
                        previousStatus: payment.order.status,
                        newStatus: "REFUNDED",
                        changedBy: userId ?? null,
                        reason: `Payment fully refunded (Refund ID: ${createdRefund.id})`,
                    },
                });
            }

            // E. Create Outbox Event
            await tx.outboxEvent.create({
                data: {
                    eventType: isFullyRefunded ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED",
                    aggregateType: "Payment",
                    aggregateId: payment.id,
                    payload: {
                        paymentId: payment.id,
                        refundId: createdRefund.id,
                        orderId: payment.orderId,
                        amount: refundAmount,
                        currency: payment.currency,
                        isFullRefund: isFullyRefunded,
                        refundedAt: new Date().toISOString(),
                    },
                },
            });

            return { refund: createdRefund };
        });

        return {
            refundId: refund.id,
            paymentId: payment.id,
            orderId: payment.orderId,
            amount: refundAmount,
            currency: payment.currency,
            providerRefundId: refund.providerRefundId,
            status: refund.status,
            paymentStatus: newPaymentStatus,
            totalRefunded: newRefundedTotal,
            remainingBalance: Number((paidAmount - newRefundedTotal).toFixed(2)),
        };
    }
}

export const paymentRefundService = new PaymentRefundService();
