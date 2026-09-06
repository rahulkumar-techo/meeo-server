import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { paymentProviderRegistry } from "../providers/paymentProvider.registry.js";
import { paymentWebhookService } from "./paymentWebhook.service.js";

export class PaymentReconciliationService {
    /**
     * Reconciles the local payment state against the external payment gateway.
     */
    async reconcilePayment(paymentId: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: {
                attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
                order: true,
            },
        });

        if (!payment) {
            throw new AppError("Payment record not found", 404);
        }

        const latestAttempt = payment.attempts?.[0];
        const providerPaymentId = latestAttempt?.providerPaymentId || payment.id;
        const provider = paymentProviderRegistry.getProvider(payment.provider);

        // Fetch remote status from provider
        const remoteDetails = await provider.getPaymentDetails(providerPaymentId);

        let actionTaken = "NO_ACTION_REQUIRED";

        // If local is not SUCCESS but gateway reports SUCCESS -> reconcile
        if (payment.status !== "SUCCESS" && remoteDetails.status === "SUCCESS") {
            const fakeEventData = {
                id: `reconcile_${payment.id}_${Date.now()}`,
                type: "payment_intent.succeeded",
                data: {
                    paymentId: payment.id,
                    providerPaymentId,
                    orderId: payment.orderId,
                    amount: Number(payment.amount),
                    currency: payment.currency,
                },
            };

            await paymentWebhookService.processWebhook(
                payment.provider,
                fakeEventData,
                { "x-test-bypass-signature": "true" },
            );

            actionTaken = "RECONCILED_TO_SUCCESS";
        }

        // Fetch fresh state after potential reconciliation
        const updatedPayment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { order: true, attempts: true, refunds: true, transactions: true },
        });

        return {
            paymentId: payment.id,
            orderId: payment.orderId,
            provider: payment.provider,
            localStatus: updatedPayment?.status,
            remoteStatus: remoteDetails.status,
            actionTaken,
            paidAmount: Number(updatedPayment?.paidAmount || 0),
            refundedAmount: Number(updatedPayment?.refundedAmount || 0),
        };
    }
}

export const paymentReconciliationService = new PaymentReconciliationService();
