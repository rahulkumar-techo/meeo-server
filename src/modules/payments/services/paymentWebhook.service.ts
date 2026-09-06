import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { paymentProviderRegistry } from "../providers/paymentProvider.registry.js";
import { paymentTransactionService } from "./paymentTransaction.service.js";

export class PaymentWebhookService {
    /**
     * Ingests, verifies, and executes transactional updates for an incoming payment gateway webhook.
     */
    async processWebhook(
        providerName: string,
        rawPayload: any,
        headers: Record<string, string | string[] | undefined>,
    ) {
        const provider = paymentProviderRegistry.getProvider(providerName);

        // 1. Verify cryptographic signature
        const isSignatureValid = await provider.verifyWebhookSignature(rawPayload, headers);
        if (!isSignatureValid) {
            throw new AppError(`Invalid webhook signature for provider "${providerName}"`, 401);
        }

        // 2. Parse standardized webhook event
        const eventData = await provider.parseWebhookEvent(rawPayload, headers);

        // 3. Check for duplicate webhook event (Idempotency)
        const existingWebhook = await prisma.paymentWebhook.findUnique({
            where: {
                provider_providerEventId: {
                    provider: provider.name,
                    providerEventId: eventData.providerEventId,
                },
            },
        });

        if (existingWebhook && existingWebhook.processingStatus === "COMPLETED") {
            return {
                idempotent: true,
                message: `Webhook event "${eventData.providerEventId}" was already processed`,
                status: "COMPLETED",
            };
        }

        // 4. Create or update PaymentWebhook ingestion record
        const webhookRecord = existingWebhook
            ? existingWebhook
            : await prisma.paymentWebhook.create({
                data: {
                    provider: provider.name,
                    providerEventId: eventData.providerEventId,
                    eventType: eventData.eventType,
                    payload: (typeof rawPayload === "object" ? rawPayload : JSON.parse(rawPayload)) as any,
                    signatureVerified: true,
                    processingStatus: "PROCESSING",
                },
            });

        try {
            // 5. Find target payment
            let payment = null;
            if (eventData.paymentId) {
                payment = await prisma.payment.findUnique({
                    where: { id: eventData.paymentId },
                    include: { order: true, attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
                });
            }

            if (!payment && eventData.providerPaymentId) {
                const attempt = await prisma.paymentAttempt.findFirst({
                    where: { providerPaymentId: eventData.providerPaymentId },
                    include: { payment: { include: { order: true, attempts: true } } },
                });
                if (attempt) {
                    payment = attempt.payment;
                }
            }

            if (!payment && eventData.orderId) {
                payment = await prisma.payment.findFirst({
                    where: { orderId: eventData.orderId },
                    include: { order: true, attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
                });
            }

            if (!payment) {
                // Unknown payment, record and exit gracefully
                await prisma.paymentWebhook.update({
                    where: { id: webhookRecord.id },
                    data: {
                        processingStatus: "COMPLETED",
                        errorMessage: `No matching payment record found for event ${eventData.providerEventId}`,
                        processedAt: new Date(),
                    },
                });
                return {
                    idempotent: false,
                    message: "Webhook recorded but no matching payment found",
                    status: "UNMATCHED",
                };
            }

            // 6. Handle SUCCESS state via Atomic Transaction
            if (eventData.status === "SUCCESS") {
                await this.handlePaymentSuccess(payment, eventData, webhookRecord.id);
            } else if (eventData.status === "FAILED") {
                await this.handlePaymentFailure(payment, eventData, webhookRecord.id);
            } else {
                // Update webhook to COMPLETED for non-terminal status
                await prisma.paymentWebhook.update({
                    where: { id: webhookRecord.id },
                    data: { processingStatus: "COMPLETED", processedAt: new Date() },
                });
            }

            return {
                idempotent: false,
                message: `Webhook "${eventData.eventType}" processed successfully`,
                status: "COMPLETED",
                paymentId: payment.id,
            };
        } catch (error: any) {
            await prisma.paymentWebhook.update({
                where: { id: webhookRecord.id },
                data: {
                    processingStatus: "FAILED",
                    errorMessage: error?.message || "Error processing webhook",
                },
            });
            throw error;
        }
    }

    /**
     * Executes atomic database transaction when a payment succeeds.
     */
    private async handlePaymentSuccess(payment: any, eventData: any, webhookId: string) {
        const latestAttempt = payment.attempts?.[0];
        const paidAmount = eventData.amount || Number(payment.amount);

        await prisma.$transaction(async (tx) => {
            // A. Update Payment
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: "SUCCESS",
                    paidAmount,
                    paidAt: new Date(),
                },
            });

            // B. Update latest PaymentAttempt if exists
            if (latestAttempt) {
                await tx.paymentAttempt.update({
                    where: { id: latestAttempt.id },
                    data: {
                        status: "SUCCESS",
                        completedAt: new Date(),
                    },
                });
            }

            // C. Record CHARGE ledger transaction
            await tx.paymentTransaction.create({
                data: {
                    paymentId: payment.id,
                    paymentAttemptId: latestAttempt?.id ?? null,
                    type: "CHARGE",
                    status: "SUCCESS",
                    amount: paidAmount,
                    currency: payment.currency,
                    providerTransactionId: eventData.providerEventId,
                    providerResponse: eventData.rawPayload ?? undefined,
                },
            });

            // D. Update Order status to CONFIRMED and record status history
            if (payment.order && payment.order.status !== "CONFIRMED") {
                await tx.order.update({
                    where: { id: payment.order.id },
                    data: { status: "CONFIRMED" },
                });

                await tx.orderStatusHistory.create({
                    data: {
                        orderId: payment.order.id,
                        previousStatus: payment.order.status,
                        newStatus: "CONFIRMED",
                        reason: `Payment confirmed via ${payment.provider} (Event: ${eventData.providerEventId})`,
                    },
                });
            }

            // E. Confirm Inventory Reservations
            const activeReservations = await tx.inventoryReservation.findMany({
                where: {
                    orderId: payment.orderId,
                    status: "ACTIVE",
                },
            });

            for (const res of activeReservations) {
                // Deduct from reservedQuantity
                await tx.inventory.update({
                    where: { variantId: res.variantId },
                    data: {
                        reservedQuantity: { decrement: res.quantity },
                    },
                });

                // Mark reservation CONFIRMED
                await tx.inventoryReservation.update({
                    where: { id: res.id },
                    data: { status: "CONFIRMED" },
                });

                // Log ORDER_CONFIRMED inventory transaction
                await tx.inventoryTransaction.create({
                    data: {
                        variantId: res.variantId,
                        type: "ORDER_CONFIRMED",
                        quantity: res.quantity,
                        note: `Confirmed stock sale for Order ${payment.orderId}`,
                        referenceType: "ORDER",
                        referenceId: payment.orderId,
                    },
                });
            }

            // F. Create Outbox Event
            await tx.outboxEvent.create({
                data: {
                    eventType: "ORDER_PAID",
                    aggregateType: "Payment",
                    aggregateId: payment.id,
                    payload: {
                        paymentId: payment.id,
                        orderId: payment.orderId,
                        amount: paidAmount,
                        currency: payment.currency,
                        provider: payment.provider,
                        paidAt: new Date().toISOString(),
                    },
                },
            });

            // G. Update Webhook record to COMPLETED
            await tx.paymentWebhook.update({
                where: { id: webhookId },
                data: {
                    processingStatus: "COMPLETED",
                    processedAt: new Date(),
                },
            });
        });
    }

    /**
     * Updates payment and attempt state on failure.
     */
    private async handlePaymentFailure(payment: any, eventData: any, webhookId: string) {
        const latestAttempt = payment.attempts?.[0];

        await prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: "FAILED",
                    failedAt: new Date(),
                },
            });

            if (latestAttempt) {
                await tx.paymentAttempt.update({
                    where: { id: latestAttempt.id },
                    data: {
                        status: "FAILED",
                        failureCode: eventData.failureCode ?? "PAYMENT_FAILED",
                        failureMessage: eventData.failureMessage ?? "Gateway reported failure",
                        completedAt: new Date(),
                    },
                });
            }

            await tx.paymentTransaction.create({
                data: {
                    paymentId: payment.id,
                    paymentAttemptId: latestAttempt?.id ?? null,
                    type: "CHARGE",
                    status: "FAILED",
                    amount: eventData.amount || Number(payment.amount),
                    currency: payment.currency,
                    providerTransactionId: eventData.providerEventId,
                    failureCode: eventData.failureCode ?? null,
                    failureMessage: eventData.failureMessage ?? null,
                },
            });

            await tx.outboxEvent.create({
                data: {
                    eventType: "PAYMENT_FAILED",
                    aggregateType: "Payment",
                    aggregateId: payment.id,
                    payload: {
                        paymentId: payment.id,
                        orderId: payment.orderId,
                        failureCode: eventData.failureCode,
                        failureMessage: eventData.failureMessage,
                    },
                },
            });

            await tx.paymentWebhook.update({
                where: { id: webhookId },
                data: {
                    processingStatus: "COMPLETED",
                    processedAt: new Date(),
                },
            });
        });
    }
}

export const paymentWebhookService = new PaymentWebhookService();
