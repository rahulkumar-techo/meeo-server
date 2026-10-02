import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { razorpayPaymentProvider } from "../providers/razorpayPayment.provider.js";
import { paymentVerificationService } from "./paymentVerification.service.js";

export class PaymentReconciliationService {
    /**
     * Reconciles the local payment state against the Razorpay gateway.
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
        // Fetch remote status from Razorpay
        const remoteDetails = await razorpayPaymentProvider.getPaymentDetails(providerPaymentId);

        let actionTaken = "NO_ACTION_REQUIRED";

        // If local is not SUCCESS but gateway reports SUCCESS -> reconcile via verification service
        if (payment.status !== "SUCCESS" && remoteDetails.status === "SUCCESS") {
            await paymentVerificationService.verifyPayment({
                orderId: payment.orderId,
                razorpayOrderId: providerPaymentId,
                razorpayPaymentId: providerPaymentId,
                razorpaySignature: "reconciled_signature",
            }).catch(() => null);

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
