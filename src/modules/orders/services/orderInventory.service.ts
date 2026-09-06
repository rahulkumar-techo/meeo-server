import { AppError } from "@/common/errors/app-error.js";

export interface CartItemInventoryRequirement {
    variantId: string;
    productName: string;
    sku: string;
    quantity: number;
}

export class OrderInventoryService {
    /**
     * Atomically validates stock and creates checkout inventory reservations within transaction tx.
     */
    async reserveItemsForOrder(
        tx: any,
        orderId: string,
        items: CartItemInventoryRequirement[],
        expiresInMinutes = 30,
    ) {
        const reservations = [];
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        for (const item of items) {
            const inventory = await tx.inventory.findUnique({
                where: { variantId: item.variantId },
            });

            if (!inventory) {
                throw new AppError(
                    `Inventory record not found for "${item.productName}" (${item.sku})`,
                    404,
                );
            }

            if (inventory.availableQuantity < item.quantity) {
                throw new AppError(
                    `Insufficient stock for "${item.productName}" (${item.sku}). Requested: ${item.quantity}, Available: ${inventory.availableQuantity}`,
                    400,
                );
            }

            // Shift available -> reserved
            await tx.inventory.update({
                where: { variantId: item.variantId },
                data: {
                    availableQuantity: { decrement: item.quantity },
                    reservedQuantity: { increment: item.quantity },
                },
            });

            // Create Reservation record
            const reservation = await tx.inventoryReservation.create({
                data: {
                    variantId: item.variantId,
                    orderId,
                    quantity: item.quantity,
                    status: "ACTIVE",
                    expiresAt,
                },
            });

            // Log ledger transaction
            await tx.inventoryTransaction.create({
                data: {
                    variantId: item.variantId,
                    type: "ORDER_RESERVED",
                    quantity: item.quantity,
                    note: `Reserved ${item.quantity} units for Order ${orderId}`,
                    referenceType: "ORDER",
                    referenceId: orderId,
                },
            });

            reservations.push(reservation);
        }

        return reservations;
    }

    /**
     * Releases active reservations and restores stock when an order is cancelled.
     */
    async releaseOrderReservations(tx: any, orderId: string, reason = "Order cancelled") {
        const reservations = await tx.inventoryReservation.findMany({
            where: {
                orderId,
                status: "ACTIVE",
            },
        });

        for (const res of reservations) {
            // Restore inventory: decrement reserved, increment available
            await tx.inventory.update({
                where: { variantId: res.variantId },
                data: {
                    availableQuantity: { increment: res.quantity },
                    reservedQuantity: { decrement: res.quantity },
                },
            });

            // Mark reservation RELEASED
            await tx.inventoryReservation.update({
                where: { id: res.id },
                data: { status: "RELEASED" },
            });

            // Log restoration transaction
            await tx.inventoryTransaction.create({
                data: {
                    variantId: res.variantId,
                    type: "ORDER_CANCELLED",
                    quantity: res.quantity,
                    note: `Released hold for Order ${orderId}: ${reason}`,
                    referenceType: "ORDER",
                    referenceId: orderId,
                },
            });
        }

        return reservations.length;
    }
}

export const orderInventoryService = new OrderInventoryService();
