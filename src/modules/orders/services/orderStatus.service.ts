import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { orderCreationService } from "./orderCreation.service.js";
import type { OrderStatusUpdateInput } from "../validations/order.validation.js";

export class OrderStatusService {
    /**
     * Updates an order status, writes an audit record in OrderStatusHistory, and releases holds if cancelled.
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

        await prisma.$transaction(async (tx) => {
            // Update order status
            await tx.order.update({
                where: { id: orderId },
                data: { status: newStatus },
            });

            // Write status history audit
            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    previousStatus,
                    newStatus,
                    changedBy: changedBy ?? null,
                    reason: input.reason ?? `Order status transitioned from ${previousStatus} to ${newStatus}`,
                },
            });

            // If order transitioned to CANCELLED or EXPIRED, release inventory reservations
            if (newStatus === "CANCELLED" || newStatus === "EXPIRED") {
                await orderInventoryService.releaseOrderReservations(
                    tx,
                    orderId,
                    input.reason ?? `Order transitioned to ${newStatus}`,
                );
            }
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

        // Customer can only cancel before fulfillment has begun
        if (!isAdmin && order.status !== "PENDING" && order.status !== "PAYMENT_PENDING") {
            throw new AppError(
                `Cannot cancel order with current status "${order.status}". Please contact customer support.`,
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
