import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { ReserveStockInput } from "../validations/inventory.validation.js";

/**
 * Service managing stock reservations for checkout sessions and TTL expiration.
 */
export class ReservationService {
    /**
     * Reserve stock for checkout with overselling protection and TTL expiration.
     */
    async reserveStock(input: ReserveStockInput) {
        const { variantId, quantity, orderId, expiresInMinutes = 15 } = input;

        return await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findUnique({
                where: { variantId },
            });

            if (!inventory) {
                throw new AppError("Inventory record not found for this variant", 404);
            }

            if (inventory.availableQuantity < quantity) {
                throw new AppError(
                    `Insufficient stock to reserve. Requested: ${quantity}, Available: ${inventory.availableQuantity}.`,
                    400,
                );
            }

            const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

            // Shift quantity from available to reserved
            const updatedInventory = await tx.inventory.update({
                where: { variantId },
                data: {
                    availableQuantity: { decrement: quantity },
                    reservedQuantity: { increment: quantity },
                },
            });

            const reservation = await tx.inventoryReservation.create({
                data: {
                    variantId,
                    orderId: orderId ?? null,
                    quantity,
                    status: "ACTIVE",
                    expiresAt,
                },
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId,
                    type: "ORDER_RESERVED",
                    quantity,
                    note: `Reserved ${quantity} units for checkout. Expires at ${expiresAt.toISOString()}`,
                    referenceType: "RESERVATION",
                    referenceId: reservation.id,
                },
            });

            return {
                reservation,
                inventory: updatedInventory,
                transaction,
            };
        });
    }

    /**
     * Confirm a reservation upon successful payment.
     */
    async confirmReservation(reservationId: string, orderId?: string) {
        return await prisma.$transaction(async (tx) => {
            const reservation = await tx.inventoryReservation.findUnique({
                where: { id: reservationId },
            });

            if (!reservation) {
                throw new AppError("Inventory reservation not found", 404);
            }

            if (reservation.status !== "ACTIVE") {
                throw new AppError(
                    `Cannot confirm reservation. Current status is ${reservation.status}.`,
                    400,
                );
            }

            // Check if reservation expired
            if (new Date() > reservation.expiresAt) {
                // Auto-expire and return stock
                await tx.inventory.update({
                    where: { variantId: reservation.variantId },
                    data: {
                        availableQuantity: { increment: reservation.quantity },
                        reservedQuantity: { decrement: reservation.quantity },
                    },
                });

                await tx.inventoryReservation.update({
                    where: { id: reservationId },
                    data: { status: "EXPIRED" },
                });

                await tx.inventoryTransaction.create({
                    data: {
                        variantId: reservation.variantId,
                        type: "ORDER_CANCELLED",
                        quantity: reservation.quantity,
                        note: "Reservation confirmation rejected: TTL expired",
                        referenceType: "RESERVATION",
                        referenceId: reservation.id,
                    },
                });

                throw new AppError(
                    "Reservation has expired. Stock has been restored to available inventory.",
                    400,
                );
            }

            // Successfully deduct from reservedQuantity
            const updatedInventory = await tx.inventory.update({
                where: { variantId: reservation.variantId },
                data: {
                    reservedQuantity: { decrement: reservation.quantity },
                },
            });

            const updatedReservation = await tx.inventoryReservation.update({
                where: { id: reservationId },
                data: {
                    status: "CONFIRMED",
                    orderId: orderId ?? reservation.orderId,
                },
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId: reservation.variantId,
                    type: "ORDER_CONFIRMED",
                    quantity: reservation.quantity,
                    note: `Reservation confirmed for order ${orderId ?? reservation.orderId ?? "N/A"}`,
                    referenceType: "ORDER",
                    referenceId: orderId ?? reservation.orderId ?? reservation.id,
                },
            });

            return {
                reservation: updatedReservation,
                inventory: updatedInventory,
                transaction,
            };
        });
    }

    /**
     * Release a reservation upon payment failure, cancellation, or checkout abandonment.
     */
    async releaseReservation(reservationId: string, reason?: string) {
        return await prisma.$transaction(async (tx) => {
            const reservation = await tx.inventoryReservation.findUnique({
                where: { id: reservationId },
            });

            if (!reservation) {
                throw new AppError("Inventory reservation not found", 404);
            }

            if (reservation.status !== "ACTIVE") {
                throw new AppError(
                    `Cannot release reservation. Current status is ${reservation.status}.`,
                    400,
                );
            }

            // Restore available quantity and release reserved
            const updatedInventory = await tx.inventory.update({
                where: { variantId: reservation.variantId },
                data: {
                    availableQuantity: { increment: reservation.quantity },
                    reservedQuantity: { decrement: reservation.quantity },
                },
            });

            const updatedReservation = await tx.inventoryReservation.update({
                where: { id: reservationId },
                data: { status: "RELEASED" },
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId: reservation.variantId,
                    type: "ORDER_CANCELLED",
                    quantity: reservation.quantity,
                    note: reason ?? "Reservation released: Checkout cancelled or failed",
                    referenceType: "RESERVATION",
                    referenceId: reservation.id,
                },
            });

            return {
                reservation: updatedReservation,
                inventory: updatedInventory,
                transaction,
            };
        });
    }

    /**
     * Background cleanup: Sweeps and expires all active reservations whose TTL has passed.
     */
    async expireStaleReservations() {
        const now = new Date();
        const expiredReservations = await prisma.inventoryReservation.findMany({
            where: {
                status: "ACTIVE",
                expiresAt: { lt: now },
            },
        });

        if (expiredReservations.length === 0) {
            return { expiredCount: 0, restoredUnits: 0 };
        }

        let totalUnitsRestored = 0;

        for (const res of expiredReservations) {
            await prisma.$transaction(async (tx) => {
                await tx.inventory.update({
                    where: { variantId: res.variantId },
                    data: {
                        availableQuantity: { increment: res.quantity },
                        reservedQuantity: { decrement: res.quantity },
                    },
                });

                await tx.inventoryReservation.update({
                    where: { id: res.id },
                    data: { status: "EXPIRED" },
                });

                await tx.inventoryTransaction.create({
                    data: {
                        variantId: res.variantId,
                        type: "ORDER_CANCELLED",
                        quantity: res.quantity,
                        note: "Auto-expired: Reservation hold window elapsed",
                        referenceType: "RESERVATION",
                        referenceId: res.id,
                    },
                });

                totalUnitsRestored += res.quantity;
            });
        }

        return {
            expiredCount: expiredReservations.length,
            restoredUnits: totalUnitsRestored,
        };
    }
}

export const reservationService = new ReservationService();
