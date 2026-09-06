import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        payment: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        paymentAttempt: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        paymentTransaction: {
            create: vi.fn(),
            findMany: vi.fn(),
        },
        paymentWebhook: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        refund: {
            create: vi.fn(),
            findMany: vi.fn(),
        },
        order: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        orderStatusHistory: {
            create: vi.fn(),
        },
        inventory: {
            update: vi.fn(),
        },
        inventoryReservation: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
        inventoryTransaction: {
            create: vi.fn(),
        },
        outboxEvent: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: any) => any) => {
            if (typeof callback === "function") {
                return callback(prismaMock);
            }
            return Promise.all(callback as unknown as Promise<unknown>[]);
        }),
    },
}));

vi.mock("@/lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import { paymentProviderRegistry } from "../modules/payments/providers/paymentProvider.registry.js";
import { PaymentCreationService } from "../modules/payments/services/paymentCreation.service.js";
import { PaymentAttemptService } from "../modules/payments/services/paymentAttempt.service.js";
import { PaymentTransactionService } from "../modules/payments/services/paymentTransaction.service.js";
import { PaymentWebhookService } from "../modules/payments/services/paymentWebhook.service.js";
import { PaymentRefundService } from "../modules/payments/services/paymentRefund.service.js";
import { PaymentReconciliationService } from "../modules/payments/services/paymentReconciliation.service.js";
import { PaymentQueryService } from "../modules/payments/services/paymentQuery.service.js";

describe("Payment System Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ----------------------------------------------------
    // Provider Registry Tests
    // ----------------------------------------------------
    describe("PaymentProviderRegistry", () => {
        it("resolves registered providers (MOCK, STRIPE, RAZORPAY)", () => {
            const mockProv = paymentProviderRegistry.getProvider("MOCK");
            expect(mockProv.name).toBe("MOCK");

            const stripeProv = paymentProviderRegistry.getProvider("stripe");
            expect(stripeProv.name).toBe("STRIPE");

            const rzpProv = paymentProviderRegistry.getProvider("RAZORPAY");
            expect(rzpProv.name).toBe("RAZORPAY");
        });

        it("throws error for unsupported provider", () => {
            expect(() => paymentProviderRegistry.getProvider("UNKNOWN_PAY")).toThrow(
                /Unsupported payment provider/,
            );
        });
    });

    // ----------------------------------------------------
    // Payment Creation Service Tests
    // ----------------------------------------------------
    describe("PaymentCreationService", () => {
        const service = new PaymentCreationService();

        it("throws 404 when target order does not exist", async () => {
            prismaMock.order.findUnique.mockResolvedValue(null);

            await expect(
                service.initializePayment("user-1", {
                    orderId: "e2b9c3f5-0000-0000-0000-000000000000",
                    provider: "MOCK",
                }),
            ).rejects.toThrow("Order not found");
        });

        it("throws 403 when user does not own the order", async () => {
            prismaMock.order.findUnique.mockResolvedValue({
                id: "ord-1",
                userId: "other-user",
                status: "PENDING",
            });

            await expect(
                service.initializePayment("user-1", {
                    orderId: "e2b9c3f5-0000-0000-0000-000000000000",
                    provider: "MOCK",
                }),
            ).rejects.toThrow("Forbidden");
        });

        it("initializes payment session, creates attempt, and transitions order to PAYMENT_PENDING", async () => {
            prismaMock.order.findUnique.mockResolvedValue({
                id: "ord-1",
                orderNumber: "ORD-20260906-0001",
                userId: "user-1",
                status: "PENDING",
                currency: "USD",
                grandTotal: 150.0,
                user: { id: "user-1", email: "user@example.com", firstName: "John", lastName: "Doe" },
            });

            prismaMock.payment.findFirst.mockResolvedValue(null);
            prismaMock.payment.create.mockResolvedValue({
                id: "pay-1",
                orderId: "ord-1",
                provider: "MOCK",
                status: "PENDING",
                currency: "USD",
                amount: 150.0,
            });

            prismaMock.paymentAttempt.findFirst.mockResolvedValue(null);
            prismaMock.paymentAttempt.create.mockResolvedValue({
                id: "att-1",
                paymentId: "pay-1",
                attemptNumber: 1,
                status: "PROCESSING",
                amount: 150.0,
            });

            const result = await service.initializePayment("user-1", {
                orderId: "ord-1",
                provider: "MOCK",
            });

            expect(result.paymentId).toBe("pay-1");
            expect(result.orderNumber).toBe("ORD-20260906-0001");
            expect(result.amount).toBe(150.0);
            expect(result.attemptNumber).toBe(1);
            expect(prismaMock.payment.create).toHaveBeenCalled();
            expect(prismaMock.paymentAttempt.create).toHaveBeenCalled();
            expect(prismaMock.order.update).toHaveBeenCalledWith({
                where: { id: "ord-1" },
                data: { status: "PAYMENT_PENDING" },
            });
        });

        it("retries payment by creating an incremented attempt", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                orderId: "ord-1",
                provider: "MOCK",
                status: "FAILED",
                currency: "USD",
                amount: 150.0,
                order: {
                    id: "ord-1",
                    orderNumber: "ORD-20260906-0001",
                    userId: "user-1",
                    status: "PAYMENT_PENDING",
                },
            });

            prismaMock.paymentAttempt.findFirst.mockResolvedValue({
                id: "att-1",
                attemptNumber: 1,
            });

            prismaMock.paymentAttempt.create.mockResolvedValue({
                id: "att-2",
                paymentId: "pay-1",
                attemptNumber: 2,
                status: "PROCESSING",
                amount: 150.0,
            });

            const result = await service.retryPayment("user-1", {
                paymentId: "pay-1",
            });

            expect(result.paymentId).toBe("pay-1");
            expect(result.attemptNumber).toBe(2);
            expect(result.status).toBe("PROCESSING");
            expect(prismaMock.payment.update).toHaveBeenCalledWith({
                where: { id: "pay-1" },
                data: { status: "PROCESSING" },
            });
        });
    });

    // ----------------------------------------------------
    // Payment Attempt Service Tests
    // ----------------------------------------------------
    describe("PaymentAttemptService", () => {
        const service = new PaymentAttemptService();

        it("creates next incremented attempt", async () => {
            prismaMock.paymentAttempt.findFirst.mockResolvedValue({ attemptNumber: 2 });
            prismaMock.paymentAttempt.create.mockResolvedValue({
                id: "att-3",
                paymentId: "pay-1",
                attemptNumber: 3,
                status: "PENDING",
                amount: 100,
            });

            const attempt = await service.createNextAttempt({
                paymentId: "pay-1",
                amount: 100,
            });

            expect(attempt.attemptNumber).toBe(3);
        });

        it("marks attempt as failed with failure codes", async () => {
            prismaMock.paymentAttempt.update.mockResolvedValue({
                id: "att-1",
                status: "FAILED",
                failureCode: "INSUFFICIENT_FUNDS",
                failureMessage: "Card declined due to insufficient funds",
            });

            const updated = await service.markAttemptFailed(
                "att-1",
                "INSUFFICIENT_FUNDS",
                "Card declined due to insufficient funds",
            );

            expect(updated.status).toBe("FAILED");
            expect(updated.failureCode).toBe("INSUFFICIENT_FUNDS");
        });
    });

    // ----------------------------------------------------
    // Payment Transaction Service Tests
    // ----------------------------------------------------
    describe("PaymentTransactionService", () => {
        const service = new PaymentTransactionService();

        it("records a financial ledger entry", async () => {
            prismaMock.paymentTransaction.create.mockResolvedValue({
                id: "tx-1",
                paymentId: "pay-1",
                type: "CHARGE",
                status: "SUCCESS",
                amount: 100,
                currency: "USD",
            });

            const tx = await service.recordTransaction({
                paymentId: "pay-1",
                type: "CHARGE",
                status: "SUCCESS",
                amount: 100,
                currency: "USD",
            });

            expect(tx.id).toBe("tx-1");
            expect(tx.type).toBe("CHARGE");
            expect(tx.status).toBe("SUCCESS");
        });
    });

    // ----------------------------------------------------
    // Payment Webhook Service Tests
    // ----------------------------------------------------
    describe("PaymentWebhookService", () => {
        const service = new PaymentWebhookService();

        it("rejects webhook when cryptographic signature is invalid", async () => {
            await expect(
                service.processWebhook("MOCK", { id: "evt_1" }, { "x-mock-signature": "invalid_sig" }),
            ).rejects.toThrow("Invalid webhook signature");
        });

        it("deduplicates already completed webhook events idempotently", async () => {
            prismaMock.paymentWebhook.findUnique.mockResolvedValue({
                id: "wh-1",
                provider: "MOCK",
                providerEventId: "evt_dup_123",
                processingStatus: "COMPLETED",
            });

            const result = await service.processWebhook(
                "MOCK",
                { id: "evt_dup_123", type: "payment_intent.succeeded" },
                { "x-test-bypass-signature": "true" },
            );

            expect(result.idempotent).toBe(true);
            expect(result.status).toBe("COMPLETED");
            expect(prismaMock.payment.update).not.toHaveBeenCalled();
        });

        it("executes atomic transaction on payment success webhook", async () => {
            prismaMock.paymentWebhook.findUnique.mockResolvedValue(null);
            prismaMock.paymentWebhook.create.mockResolvedValue({ id: "wh-1" });

            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                orderId: "ord-1",
                provider: "MOCK",
                currency: "USD",
                amount: 200.0,
                order: { id: "ord-1", status: "PAYMENT_PENDING" },
                attempts: [{ id: "att-1", status: "PROCESSING" }],
            });

            prismaMock.inventoryReservation.findMany.mockResolvedValue([
                { id: "res-1", variantId: "var-1", quantity: 2, status: "ACTIVE" },
            ]);

            const result = await service.processWebhook(
                "MOCK",
                {
                    id: "evt_success_1",
                    type: "payment_intent.succeeded",
                    data: {
                        paymentId: "pay-1",
                        amount: 200.0,
                        currency: "USD",
                    },
                },
                { "x-test-bypass-signature": "true" },
            );

            expect(result.status).toBe("COMPLETED");
            expect(result.paymentId).toBe("pay-1");

            // Verify side-effects in transaction
            expect(prismaMock.payment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "pay-1" },
                    data: expect.objectContaining({ status: "SUCCESS", paidAmount: 200.0 }),
                }),
            );
            expect(prismaMock.order.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "ord-1" },
                    data: { status: "CONFIRMED" },
                }),
            );
            expect(prismaMock.inventory.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { variantId: "var-1" },
                    data: { reservedQuantity: { decrement: 2 } },
                }),
            );
            expect(prismaMock.inventoryReservation.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "res-1" },
                    data: { status: "CONFIRMED" },
                }),
            );
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "ORDER_PAID",
                        aggregateType: "Payment",
                    }),
                }),
            );
        });
    });

    // ----------------------------------------------------
    // Payment Refund Service Tests
    // ----------------------------------------------------
    describe("PaymentRefundService", () => {
        const service = new PaymentRefundService();

        it("throws error when refunding unpaid or pending payment", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                status: "PENDING",
            });

            await expect(
                service.processRefund("admin-1", { paymentId: "pay-1" }),
            ).rejects.toThrow(/Cannot refund payment in "PENDING" status/);
        });

        it("throws error when refund amount exceeds remaining refundable balance", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                status: "SUCCESS",
                paidAmount: 100.0,
                refundedAmount: 80.0, // Remaining: 20
                attempts: [{ id: "att-1", status: "SUCCESS" }],
            });

            await expect(
                service.processRefund("admin-1", { paymentId: "pay-1", amount: 50.0 }),
            ).rejects.toThrow(/exceeds refundable balance/);
        });

        it("processes partial refund and updates payment to PARTIALLY_REFUNDED", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                orderId: "ord-1",
                provider: "MOCK",
                currency: "USD",
                status: "SUCCESS",
                paidAmount: 100.0,
                refundedAmount: 0.0,
                attempts: [{ id: "att-1", status: "SUCCESS", providerPaymentId: "mock_123" }],
                order: { id: "ord-1", status: "CONFIRMED" },
            });

            prismaMock.refund.create.mockResolvedValue({ id: "ref-1", status: "SUCCESS" });

            const result = await service.processRefund("admin-1", {
                paymentId: "pay-1",
                amount: 30.0,
                reason: "Customer requested partial discount",
            });

            expect(result.amount).toBe(30.0);
            expect(result.paymentStatus).toBe("PARTIALLY_REFUNDED");
            expect(result.remainingBalance).toBe(70.0);
            expect(prismaMock.payment.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "pay-1" },
                    data: { refundedAmount: 30.0, status: "PARTIALLY_REFUNDED" },
                }),
            );
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ eventType: "PAYMENT_PARTIALLY_REFUNDED" }),
                }),
            );
        });

        it("processes full refund and updates both payment and order to REFUNDED", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                orderId: "ord-1",
                provider: "MOCK",
                currency: "USD",
                status: "SUCCESS",
                paidAmount: 100.0,
                refundedAmount: 0.0,
                attempts: [{ id: "att-1", status: "SUCCESS", providerPaymentId: "mock_123" }],
                order: { id: "ord-1", status: "CONFIRMED" },
            });

            prismaMock.refund.create.mockResolvedValue({ id: "ref-2", status: "SUCCESS" });

            const result = await service.processRefund("admin-1", {
                paymentId: "pay-1",
                amount: 100.0,
            });

            expect(result.paymentStatus).toBe("REFUNDED");
            expect(result.remainingBalance).toBe(0.0);
            expect(prismaMock.order.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "ord-1" },
                    data: { status: "REFUNDED" },
                }),
            );
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ eventType: "PAYMENT_REFUNDED" }),
                }),
            );
        });
    });

    // ----------------------------------------------------
    // Payment Query Service Tests
    // ----------------------------------------------------
    describe("PaymentQueryService", () => {
        const service = new PaymentQueryService();

        it("throws 404 when payment not found", async () => {
            prismaMock.payment.findUnique.mockResolvedValue(null);
            await expect(service.getPaymentById("pay-unknown")).rejects.toThrow("Payment record not found");
        });

        it("throws 403 when user does not own the payment order", async () => {
            prismaMock.payment.findUnique.mockResolvedValue({
                id: "pay-1",
                order: { userId: "other-user" },
            });

            await expect(service.getPaymentById("pay-1", "user-1")).rejects.toThrow("Forbidden");
        });
    });
});
