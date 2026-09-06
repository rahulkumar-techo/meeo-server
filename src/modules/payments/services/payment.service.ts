import { paymentCreationService } from "./paymentCreation.service.js";
import { paymentAttemptService } from "./paymentAttempt.service.js";
import { paymentTransactionService } from "./paymentTransaction.service.js";
import { paymentWebhookService } from "./paymentWebhook.service.js";
import { paymentRefundService } from "./paymentRefund.service.js";
import { paymentReconciliationService } from "./paymentReconciliation.service.js";
import { paymentQueryService } from "./paymentQuery.service.js";
import type {
    CreatePaymentIntentInput,
    RetryPaymentInput,
    CreateRefundInput,
    QueryPaymentsInput,
} from "../validations/payment.validation.js";

/**
 * Unified Payment Service Facade
 * Delegates domain operations to specialized modular services.
 */
export class PaymentService {
    // Creation & Intent
    async initializePayment(userId?: string, input?: CreatePaymentIntentInput) {
        return paymentCreationService.initializePayment(userId, input);
    }

    async retryPayment(userId?: string, input?: RetryPaymentInput) {
        return paymentCreationService.retryPayment(userId, input);
    }

    // Webhooks & Transactional Lifecycle
    async processWebhook(provider: string, rawPayload: any, headers: Record<string, any>) {
        return paymentWebhookService.processWebhook(provider, rawPayload, headers);
    }

    // Refunds
    async processRefund(userId?: string, input?: CreateRefundInput) {
        return paymentRefundService.processRefund(userId, input);
    }

    // Reconciliation
    async reconcilePayment(paymentId: string) {
        return paymentReconciliationService.reconcilePayment(paymentId);
    }

    // Queries
    async getPaymentById(paymentId: string, userId?: string) {
        return paymentQueryService.getPaymentById(paymentId, userId);
    }

    async listPayments(query: QueryPaymentsInput) {
        return paymentQueryService.listPayments(query);
    }

    // Attempts & Transactions
    async getAttemptsByPayment(paymentId: string) {
        return paymentAttemptService.getAttemptsByPayment(paymentId);
    }

    async getTransactionsByPayment(paymentId: string) {
        return paymentTransactionService.getTransactionsByPayment(paymentId);
    }
}

export const paymentService = new PaymentService();
