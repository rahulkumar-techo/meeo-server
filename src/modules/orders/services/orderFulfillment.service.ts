import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { orderStatusService } from "./orderStatus.service.js";
import { orderCreationService } from "./orderCreation.service.js";
import type { ShipOrderInput, DeliverOrderInput } from "../validations/order.validation.js";

export class OrderFulfillmentService {
    /**
     * Confirms an order and converts stock holds to committed sales.
     */
    async confirmOrder(orderId: string, changedBy?: string, reason = "Order confirmed for fulfillment") {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new AppError("Order not found", 404);
        }

        if (order.status !== "PENDING" && order.status !== "PAYMENT_PENDING") {
            throw new AppError(`Cannot confirm order in "${order.status}" status. Order must be PENDING or PAYMENT_PENDING.`, 400);
        }

        await prisma.$transaction(async (tx) => {
            // Confirm active reservations
            const reservations = await tx.inventoryReservation.findMany({
                where: { orderId, status: "ACTIVE" },
            });

            for (const res of reservations) {
                await tx.inventory.update({
                    where: { variantId: res.variantId },
                    data: { reservedQuantity: { decrement: res.quantity } },
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
                        note: `Confirmed stock sale for Order ${orderId}`,
                        referenceType: "ORDER",
                        referenceId: orderId,
                    },
                });
            }
        });

        return await orderStatusService.updateOrderStatus(
            orderId,
            { status: "CONFIRMED", reason },
            changedBy,
        );
    }

    /**
     * Transitions a confirmed order to PROCESSING (warehouse picking and packaging).
     */
    async processOrder(orderId: string, changedBy?: string, reason = "Warehouse packaging in progress") {
        return await orderStatusService.updateOrderStatus(
            orderId,
            { status: "PROCESSING", reason },
            changedBy,
        );
    }

    /**
     * Transitions an order to SHIPPED and attaches carrier tracking details.
     */
    async shipOrder(orderId: string, input: ShipOrderInput, changedBy?: string) {
        const reason = `Shipped via ${input.carrier}. Tracking #${input.trackingNumber}${input.trackingUrl ? ` (${input.trackingUrl})` : ""}${input.notes ? `. Notes: ${input.notes}` : ""}`;

        const updatedOrder = await orderStatusService.updateOrderStatus(
            orderId,
            { status: "SHIPPED", reason },
            changedBy,
        );

        return {
            ...updatedOrder,
            shipment: {
                carrier: input.carrier,
                trackingNumber: input.trackingNumber,
                trackingUrl: input.trackingUrl || null,
                estimatedDeliveryAt: input.estimatedDeliveryAt || null,
                shippedAt: new Date(),
            },
        };
    }

    /**
     * Transitions an order to DELIVERED upon final courier delivery confirmation.
     */
    async deliverOrder(orderId: string, input?: DeliverOrderInput, changedBy?: string) {
        const reason = `Delivery confirmed.${input?.receivedBy ? ` Received by: ${input.receivedBy}.` : ""}${input?.deliveryNotes ? ` Notes: ${input.deliveryNotes}` : ""}`;

        return await orderStatusService.updateOrderStatus(
            orderId,
            { status: "DELIVERED", reason },
            changedBy,
        );
    }

    /**
     * Sweeps and expires stale unconfirmed orders and releases their stock holds.
     */
    async expireStaleOrders(olderThanMinutes = 30, changedBy = "SYSTEM_EXPIRATION_SWEEPER") {
        const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

        // Find stale orders in PENDING or PAYMENT_PENDING
        const staleOrders = await prisma.order.findMany({
            where: {
                status: { in: ["PENDING", "PAYMENT_PENDING"] },
                createdAt: { lte: cutoffDate },
            },
            select: { id: true, orderNumber: true, status: true },
        });

        const expiredOrderNumbers: string[] = [];

        for (const order of staleOrders) {
            try {
                await orderStatusService.updateOrderStatus(
                    order.id,
                    { status: "EXPIRED", reason: `Order expired after exceeding ${olderThanMinutes}-minute reservation window` },
                    changedBy,
                );
                expiredOrderNumbers.push(order.orderNumber);
            } catch {
                // Continue with next order if one encounters an error
            }
        }

        return {
            scannedCount: staleOrders.length,
            expiredCount: expiredOrderNumbers.length,
            expiredOrderNumbers,
        };
    }

    /**
     * Aggregates administrative order and fulfillment metrics across statuses.
     */
    async getOrderMetrics(startDate?: string, endDate?: string) {
        const where: any = {};
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [statusCounts, aggregations] = await Promise.all([
            prisma.order.groupBy({
                by: ["status"],
                where,
                _count: { id: true },
            }),
            prisma.order.aggregate({
                where: {
                    ...where,
                    status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
                },
                _sum: { grandTotal: true },
                _avg: { grandTotal: true },
                _count: { id: true },
            }),
        ]);

        const countsByStatus: Record<string, number> = {};
        for (const item of statusCounts) {
            countsByStatus[item.status] = item._count.id;
        }

        return {
            totalOrders: Object.values(countsByStatus).reduce((a, b) => a + b, 0),
            countsByStatus,
            fulfilledOrders: (countsByStatus["DELIVERED"] || 0),
            activeFulfillmentCount: (countsByStatus["CONFIRMED"] || 0) + (countsByStatus["PROCESSING"] || 0) + (countsByStatus["SHIPPED"] || 0),
            financials: {
                totalRevenue: Number(aggregations._sum.grandTotal || 0),
                averageOrderValue: Number((aggregations._avg.grandTotal || 0).toFixed(2)),
                paidOrderCount: aggregations._count.id,
            },
        };
    }
}

export const orderFulfillmentService = new OrderFulfillmentService();
