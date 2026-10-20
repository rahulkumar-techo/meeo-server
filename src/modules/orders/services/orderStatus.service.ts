import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { orderCreationService } from "./orderCreation.service.js";
import type { OrderStatusUpdateInput } from "../validations/order.validation.js";

/**
 * Valid order status transitions state machine.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
    PENDING: ["PAYMENT_PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"],
    PAYMENT_PENDING: ["CONFIRMED", "PENDING", "CANCELLED", "EXPIRED"],
    CONFIRMED: ["PROCESSING", "CANCELLED", "REFUNDED"],
    PROCESSING: ["SHIPPED", "CANCELLED", "REFUNDED"],
    SHIPPED: ["DELIVERED", "CANCELLED", "REFUNDED"],
    DELIVERED: ["REFUNDED"],
    CANCELLED: [],
    EXPIRED: [],
    REFUNDED: [],
};

export class OrderStatusService {
    /**
     * Validates whether a requested status transition is allowed by the state machine.
     */
    validateStatusTransition(previousStatus: string, newStatus: string) {
        if (previousStatus === newStatus) {
            return;
        }

        const allowed = ALLOWED_ORDER_TRANSITIONS[previousStatus] || [];
        if (!allowed.includes(newStatus)) {
            const allowedDesc = allowed.length > 0 ? allowed.join(", ") : "None (terminal state)";
            throw new AppError(
                `Invalid order status transition from "${previousStatus}" to "${newStatus}". Allowed transitions from "${previousStatus}": [${allowedDesc}]`,
                400,
            );
        }
    }

    /**
     * Updates an order status with state machine validation, audit record logging, inventory release/restoration, and outbox event creation.
     */
    async updateOrderStatus(
        orderId: string,
        input: OrderStatusUpdateInput,
        changedBy?: string,
    ) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        const previousStatus = order.status;
        const newStatus = input.status;

        if (previousStatus === newStatus) {
            const currentOrder = await prisma.order.findUnique({
                where: { id: orderId },
                include: { items: true, address: true, statusHistory: { orderBy: { createdAt: "desc" } } },
            });
            return orderCreationService.formatOrderResponse(currentOrder);
        }

        // Validate transition against state machine
        this.validateStatusTransition(previousStatus, newStatus);

        await prisma.$transaction(async (tx) => {
            // 1. Update order status
            await tx.order.update({
                where: { id: orderId },
                data: { status: newStatus },
            });

            // 2. Write status history audit
            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    previousStatus,
                    newStatus,
                    changedBy: changedBy ?? null,
                    reason: input.reason ?? `Order status transitioned from ${previousStatus} to ${newStatus}`,
                },
            });

            // 3. If transitioning to DELIVERED, automatically resolve any pending COD payment
            if (newStatus === "DELIVERED") {
                const pendingCodPayment = await tx.payment.findFirst({
                    where: {
                        orderId,
                        provider: "COD",
                        status: "PENDING",
                    },
                });

                if (pendingCodPayment) {
                    await tx.payment.update({
                        where: { id: pendingCodPayment.id },
                        data: {
                            status: "SUCCESS",
                            paidAmount: pendingCodPayment.amount,
                            paidAt: new Date(),
                        },
                    });

                    await tx.paymentTransaction.create({
                        data: {
                            paymentId: pendingCodPayment.id,
                            type: "CHARGE",
                            status: "SUCCESS",
                            amount: Number(pendingCodPayment.amount),
                            currency: pendingCodPayment.currency,
                            providerTransactionId: `cod_delivered_${Date.now()}`,
                        },
                    });

                    await tx.outboxEvent.create({
                        data: {
                            eventType: "ORDER_PAID",
                            aggregateType: "Payment",
                            aggregateId: pendingCodPayment.id,
                            status: "PENDING",
                            payload: {
                                paymentId: pendingCodPayment.id,
                                orderId,
                                orderNumber: order.orderNumber,
                                totalAmount: Number(pendingCodPayment.amount),
                                amount: Number(pendingCodPayment.amount),
                                currency: pendingCodPayment.currency || "INR",
                                paymentMethod: "Cash on Delivery (COD)",
                                paymentStatus: "Paid",
                                userId: order.userId ?? undefined,
                                provider: "COD",
                                paidAt: new Date().toISOString(),
                            },
                        },
                    });
                }
            }

            // 4. If transitioning to CANCELLED or EXPIRED, release inventory reservations and fail pending payments
            if (newStatus === "CANCELLED" || newStatus === "EXPIRED") {
                await orderInventoryService.releaseOrderReservations(
                    tx,
                    orderId,
                    input.reason ?? `Order transitioned to ${newStatus}`,
                );

                if (tx.payment?.updateMany) {
                    await tx.payment.updateMany({
                        where: {
                            orderId,
                            status: "PENDING",
                        },
                        data: {
                            status: "FAILED",
                            failedAt: new Date(),
                        },
                    });
                }
            }

            // 4. Create Outbox Domain Event
            await tx.outboxEvent.create({
                data: {
                    eventType: `ORDER_${newStatus}`,
                    aggregateType: "Order",
                    aggregateId: orderId,
                    payload: {
                        orderId,
                        orderNumber: order.orderNumber,
                        totalAmount: Number(order.grandTotal).toFixed(2),
                        amount: Number(order.grandTotal).toFixed(2),
                        currency: order.currency || "INR",
                        userId: order.userId ?? null,
                        previousStatus,
                        newStatus,
                        changedBy: changedBy ?? null,
                        reason: input.reason ?? null,
                        timestamp: new Date().toISOString(),
                    },
                },
            });
        });

        const updatedOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                address: true,
                statusHistory: { orderBy: { createdAt: "desc" } },
                couponUsages: { include: { coupon: true } },
                reservations: true,
            },
        });

        return orderCreationService.formatOrderResponse(updatedOrder);
    }

    /**
     * Cancels an order on customer or admin request and releases stock reservations.
     */
    async cancelOrder(
        orderId: string,
        userId?: string,
        reason = "Cancelled by customer",
        isAdmin = false,
    ) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (!isAdmin && userId && order.userId !== userId) {
            throw new AppError("You are not authorized to cancel this order", 403);
        }

        // Customer can only cancel before fulfillment has begun (PENDING, PAYMENT_PENDING, CONFIRMED)
        if (!isAdmin && order.status !== "PENDING" && order.status !== "PAYMENT_PENDING" && order.status !== "CONFIRMED") {
            throw new AppError(
                `Cannot cancel order in "${order.status}" status. Please contact customer support.`,
                400,
            );
        }

        return await this.updateOrderStatus(
            orderId,
            { status: "CANCELLED", reason },
            userId,
        );
    }
}

export const orderStatusService = new OrderStatusService();
