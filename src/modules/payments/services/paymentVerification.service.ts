import crypto from "crypto";
import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { VerifyPaymentInput, RecordPaymentFailureInput, UpdatePaymentStatusInput } from "../validations/payment.validation.js";
import { logger } from "@/common/observability/logger.js";

export class PaymentVerificationService {
    /**
     * Direct synchronous payment verification for Razorpay client checkout callback.
     * Step 2 in architecture:
     * - Verifies HMAC signature
     * - Atomically marks Payment SUCCESS, Order CONFIRMED, commits inventory hold, and writes OutboxEvent.
     */
    async verifyPayment(input: VerifyPaymentInput) {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = input;
        const keySecret = process.env.RAZORPAY_TEST_SECRET_KEY || process.env.RAZORPAY_KEY_SECRET || "";

        // 1. Verify Razorpay cryptographic HMAC-SHA256 signature
        if (keySecret) {
            const expectedSignature = crypto
                .createHmac("sha256", keySecret)
                .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                .digest("hex");

            const sigBuf = Buffer.from(razorpaySignature);
            const expBuf = Buffer.from(expectedSignature);
            if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
                throw new AppError("Invalid payment signature verification", 400);
            }
        }

        // 2. Locate target payment with full order and customer relations
        const payment = await prisma.payment.findFirst({
            where: { orderId },
            include: {
                order: {
                    include: {
                        user: { select: { id: true, email: true, firstName: true, lastName: true } },
                        address: true,
                    },
                },
                attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
            },
        });

        // Retrieve cartId directly from the order (assuming the Order model has a cartId field)
        const cartId = payment?.order?.cartId;


        if (!payment) {
            throw new AppError(`No payment found for order ${orderId}`, 404);
        }

        // Idempotent exit if already verified
        if (payment.status === "SUCCESS") {
            return {
                verified: true,
                paymentId: payment.id,
                orderId: payment.orderId,
                status: "SUCCESS",
                message: "Payment already verified",
            };
        }

        // 3. Atomically execute state transitions in a single database transaction
        const latestAttempt = payment.attempts?.[0];
        const paidAmount = Number(payment.amount);
        const orderNumber = payment.order?.orderNumber || `ORD-${payment.orderId.slice(0, 8).toUpperCase()}`;
        const customerEmail = payment.order?.user?.email || "";
        const customerName = payment.order?.user
            ? `${payment.order.user.firstName || ""} ${payment.order.user.lastName || ""}`.trim()
            : payment.order?.address?.recipientName || "Valued Customer";

        await prisma.$transaction(async (tx) => {
            // A. Update Payment status to SUCCESS
            await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: "SUCCESS",
                    paidAmount,
                    paidAt: new Date(),
                },
            });

            // B. Mark the latest PaymentAttempt as SUCCESS
            if (latestAttempt) {
                await tx.paymentAttempt.update({
                    where: { id: latestAttempt.id },
                    data: {
                        status: "SUCCESS",
                        completedAt: new Date(),
                    },
                });
            }

            // C. Record immutable financial ledger transaction (CHARGE)
            await tx.paymentTransaction.create({
                data: {
                    paymentId: payment.id,
                    paymentAttemptId: latestAttempt?.id ?? null,
                    type: "CHARGE",
                    status: "SUCCESS",
                    amount: paidAmount,
                    currency: payment.currency,
                    providerTransactionId: razorpayPaymentId,
                    providerResponse: input as any,
                },
            });

            // D. Update Order status to CONFIRMED and write audit history
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
                        reason: `Payment verified via Razorpay (ID: ${razorpayPaymentId})`,
                    },
                });

                // Delete the cart now that the order is confirmed
                if (cartId) {
                    await tx.cart.deleteMany({ where: { id: cartId } });
                }
            }

            // E. Commit temporary inventory reservations into confirmed sales
            const activeReservations = await tx.inventoryReservation.findMany({
                where: {
                    orderId: payment.orderId,
                    status: "ACTIVE",
                },
            });

            for (const res of activeReservations) {
                await tx.inventory.update({
                    where: { variantId: res.variantId },
                    data: {
                        reservedQuantity: { decrement: res.quantity },
                    },
                });

                await tx.inventoryReservation.update({
                    where: { id: res.id },
                    data: { status: "CONFIRMED" },
                });

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



            // F. Create durable OutboxEvent in PostgreSQL for automated background delivery
            await tx.outboxEvent.create({
                data: {
                    eventType: "ORDER_PAID",
                    aggregateType: "Payment",
                    aggregateId: payment.id,
                    status: "PENDING",
                    payload: {
                        paymentId: payment.id,
                        orderId: payment.orderId,
                        orderNumber,
                        totalAmount: paidAmount,
                        amount: paidAmount,
                        currency: payment.currency || "INR",
                        paymentMethod: payment.paymentMethod || "Online (Razorpay)",
                        paymentStatus: "Paid",
                        userId: payment.order?.userId ?? undefined,
                        email: customerEmail,
                        customerEmail,
                        customerName,
                        provider: "RAZORPAY",
                        transactionId: razorpayPaymentId,
                        paidAt: new Date().toISOString(),
                    },
                },
            });
        });

        logger.debug(
            { cartId, paymentStatus: "SUCCESS", orderStatus: "CONFIRMED" },
            "[verifyPayment] payment verified and cart cleared"
        );

        return {
            verified: true,
            paymentId: payment.id,
            orderId: payment.orderId,
            status: "SUCCESS",
            message: "Payment verified and order confirmed successfully",
        };
    }

    /**
     * Direct recording of client-side payment failure or user cancellation.
     */
    async recordPaymentFailure(input: RecordPaymentFailureInput) {
        const { orderId, failureCode, failureMessage, providerPaymentId } = input;

        const payment = await prisma.payment.findFirst({
            where: { orderId },
            include: { order: true, attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
        });

        if (!payment) {
            throw new AppError(`No payment found for order ${orderId}`, 404);
        }

        if (payment.status === "SUCCESS") {
            return {
                recorded: false,
                paymentId: payment.id,
                orderId: payment.orderId,
                status: "SUCCESS",
                message: "Payment was already completed successfully",
            };
        }

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
                        failureCode: failureCode || "CLIENT_PAYMENT_FAILED",
                        failureMessage: failureMessage || "Payment failed or cancelled on client device",
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
                    amount: Number(payment.amount),
                    currency: payment.currency,
                    providerTransactionId: providerPaymentId || `fail_${crypto.randomBytes(6).toString("hex")}`,
                    failureCode: failureCode || null,
                    failureMessage: failureMessage || null,
                },
            });

            await tx.outboxEvent.create({
                data: {
                    eventType: "PAYMENT_FAILED",
                    aggregateType: "Payment",
                    aggregateId: payment.id,
                    status: "PENDING",
                    payload: {
                        paymentId: payment.id,
                        orderId: payment.orderId,
                        failureCode: failureCode || "PAYMENT_FAILED",
                        failureMessage: failureMessage || "Payment failed",
                    },
                },
            });
        });

        return {
            recorded: true,
            paymentId: payment.id,
            orderId: payment.orderId,
            status: "FAILED",
            message: "Payment failure recorded. Order is eligible for payment retry.",
        };
    }

    /**
     * Admin manual payment update (e.g. for COD collection, offline wire transfer, or manual adjustment).
     */
    async updatePaymentStatus(paymentId: string, input: UpdatePaymentStatusInput, adminId?: string) {
        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { order: true },
        });

        if (!payment) {
            throw new AppError("Payment record not found", 404);
        }

        const newStatus = input.status;
        const paidAmount = input.paidAmount !== undefined ? input.paidAmount : Number(payment.amount);

        await prisma.$transaction(async (tx) => {
            const updateData: any = {
                status: newStatus,
            };
            if (input.paymentMethod) {
                updateData.paymentMethod = input.paymentMethod;
            }
            if (newStatus === "SUCCESS") {
                updateData.paidAmount = paidAmount;
                updateData.paidAt = new Date();
            } else if (newStatus === "FAILED") {
                updateData.failedAt = new Date();
            }

            await tx.payment.update({
                where: { id: paymentId },
                data: updateData,
            });

            // Record transaction ledger entry
            const transactionStatus =
                newStatus === "SUCCESS"
                    ? "SUCCESS"
                    : newStatus === "FAILED" || newStatus === "CANCELLED"
                      ? "FAILED"
                      : newStatus === "PROCESSING"
                        ? "PROCESSING"
                        : "PENDING";

            await tx.paymentTransaction.create({
                data: {
                    paymentId,
                    type: newStatus === "REFUNDED" ? "REFUND" : "CHARGE",
                    status: transactionStatus,
                    amount: paidAmount,
                    currency: payment.currency,
                    providerTransactionId: input.transactionId || `manual_${Date.now()}`,
                    failureMessage: input.reason || null,
                },
            });

            // If payment is marked SUCCESS, ensure order status is updated if it was PENDING or PAYMENT_PENDING
            if (newStatus === "SUCCESS" && payment.order) {
                if (payment.order.status === "PENDING" || payment.order.status === "PAYMENT_PENDING") {
                    await tx.order.update({
                        where: { id: payment.order.id },
                        data: { status: "CONFIRMED" },
                    });

                    await tx.orderStatusHistory.create({
                        data: {
                            orderId: payment.order.id,
                            previousStatus: payment.order.status,
                            newStatus: "CONFIRMED",
                            changedBy: adminId ?? null,
                            reason: input.reason || `Payment marked SUCCESS manually by admin (${input.paymentMethod || payment.provider})`,
                        },
                    });
                }

                await tx.outboxEvent.create({
                    data: {
                        eventType: "ORDER_PAID",
                        aggregateType: "Payment",
                        aggregateId: payment.id,
                        status: "PENDING",
                        payload: {
                            paymentId: payment.id,
                            orderId: payment.orderId,
                            orderNumber: payment.order.orderNumber,
                            totalAmount: paidAmount,
                            amount: paidAmount,
                            currency: payment.currency,
                            paymentMethod: input.paymentMethod || payment.paymentMethod || payment.provider,
                            paymentStatus: "Paid",
                            userId: payment.order.userId ?? undefined,
                            changedBy: adminId ?? null,
                            reason: input.reason ?? "Manual payment update by admin",
                            paidAt: new Date().toISOString(),
                        },
                    },
                });
            } else if (newStatus === "FAILED") {
                await tx.outboxEvent.create({
                    data: {
                        eventType: "PAYMENT_FAILED",
                        aggregateType: "Payment",
                        aggregateId: payment.id,
                        status: "PENDING",
                        payload: {
                            paymentId: payment.id,
                            orderId: payment.orderId,
                            failureCode: "MANUAL_STATUS_FAILED",
                            failureMessage: input.reason || "Payment marked as failed by admin",
                        },
                    },
                });
            }
        });

        return prisma.payment.findUnique({
            where: { id: paymentId },
            include: { order: true, transactions: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
    }
}

export const paymentVerificationService = new PaymentVerificationService();
