import { prisma } from "@/lib/prisma.js";

export interface RecordTransactionParams {
    paymentId: string;
    paymentAttemptId?: string;
    type: "AUTHORIZE" | "CAPTURE" | "CHARGE" | "VOID" | "REFUND" | "REVERSAL";
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    amount: number;
    currency: string;
    providerTransactionId?: string;
    providerResponse?: any;
    idempotencyKey?: string;
    failureCode?: string;
    failureMessage?: string;
}

export class PaymentTransactionService {
    /**
     * Records a financial transaction ledger entry within an optional transaction runner.
     */
    async recordTransaction(params: RecordTransactionParams, tx: any = prisma) {
        return tx.paymentTransaction.create({
            data: {
                paymentId: params.paymentId,
                paymentAttemptId: params.paymentAttemptId ?? null,
                type: params.type,
                status: params.status,
                amount: params.amount,
                currency: params.currency,
                providerTransactionId: params.providerTransactionId ?? null,
                providerResponse: params.providerResponse ?? undefined,
                idempotencyKey: params.idempotencyKey ?? null,
                failureCode: params.failureCode ?? null,
                failureMessage: params.failureMessage ?? null,
            },
        });
    }

    /**
     * Lists transactions for a specific payment.
     */
    async getTransactionsByPayment(paymentId: string) {
        return prisma.paymentTransaction.findMany({
            where: { paymentId },
            orderBy: { createdAt: "desc" },
        });
    }
}

export const paymentTransactionService = new PaymentTransactionService();
