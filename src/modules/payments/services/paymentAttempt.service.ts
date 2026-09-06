import { prisma } from "@/lib/prisma.js";

export interface CreateAttemptParams {
    paymentId: string;
    amount: number;
    providerPaymentId?: string;
    status?: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
}

export class PaymentAttemptService {
    /**
     * Creates a new incremented payment attempt for a payment.
     */
    async createNextAttempt(params: CreateAttemptParams, tx: any = prisma) {
        // Find highest existing attempt number for this payment
        const lastAttempt = await tx.paymentAttempt.findFirst({
            where: { paymentId: params.paymentId },
            orderBy: { attemptNumber: "desc" },
        });

        const attemptNumber = (lastAttempt?.attemptNumber ?? 0) + 1;

        return tx.paymentAttempt.create({
            data: {
                paymentId: params.paymentId,
                attemptNumber,
                providerPaymentId: params.providerPaymentId ?? null,
                status: params.status ?? "PENDING",
                amount: params.amount,
                initiatedAt: new Date(),
            },
        });
    }

    /**
     * Marks an attempt as successful.
     */
    async markAttemptSuccess(attemptId: string, providerPaymentId?: string, tx: any = prisma) {
        return tx.paymentAttempt.update({
            where: { id: attemptId },
            data: {
                status: "SUCCESS",
                completedAt: new Date(),
                ...(providerPaymentId ? { providerPaymentId } : {}),
            },
        });
    }

    /**
     * Marks an attempt as failed with error details.
     */
    async markAttemptFailed(
        attemptId: string,
        failureCode?: string,
        failureMessage?: string,
        tx: any = prisma,
    ) {
        return tx.paymentAttempt.update({
            where: { id: attemptId },
            data: {
                status: "FAILED",
                completedAt: new Date(),
                failureCode: failureCode ?? null,
                failureMessage: failureMessage ?? null,
            },
        });
    }

    /**
     * Lists attempts for a payment.
     */
    async getAttemptsByPayment(paymentId: string) {
        return prisma.paymentAttempt.findMany({
            where: { paymentId },
            orderBy: { attemptNumber: "asc" },
            include: { transactions: true },
        });
    }
}

export const paymentAttemptService = new PaymentAttemptService();
