import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { inventoryService } from "../services/inventory.service.js";
import {
    addStockSchema,
    removeStockSchema,
    adjustStockSchema,
    reserveStockSchema,
    confirmReservationSchema,
    releaseReservationSchema,
    inventoryQuerySchema,
    transactionQuerySchema,
    simulateCheckoutSchema,
} from "../validations/inventory.validation.js";

type VariantParam = { variantId: string };
type ReservationParam = { id: string };

export class InventoryController {
    /**
     * Get stock for a product variant.
     */
    async getInventory(request: FastifyRequest, reply: FastifyReply) {
        const { variantId } = request.params as VariantParam;
        const result = await inventoryService.getInventory(variantId);

        return sendOk({
            reply,
            message: "Inventory retrieved successfully",
            data: result,
        });
    }

    /**
     * List all inventories with search and low-stock filters.
     */
    async listInventories(request: FastifyRequest, reply: FastifyReply) {
        const query = inventoryQuerySchema.parse(request.query);
        const result = await inventoryService.listInventories(query);

        return sendOk({
            reply,
            message: "Inventories retrieved successfully",
            data: result,
        });
    }

    /**
     * Get low stock alerts.
     */
    async getLowStockAlerts(request: FastifyRequest, reply: FastifyReply) {
        const result = await inventoryService.getLowStockAlerts();

        return sendOk({
            reply,
            message: "Low stock alerts retrieved successfully",
            data: result,
        });
    }

    /**
     * Add stock to a variant.
     */
    async addStock(request: FastifyRequest, reply: FastifyReply) {
        const body = addStockSchema.parse(request.body);
        const result = await inventoryService.addStock(body);

        return sendOk({
            reply,
            message: "Stock added successfully",
            data: result,
        });
    }

    /**
     * Remove stock from a variant.
     */
    async removeStock(request: FastifyRequest, reply: FastifyReply) {
        const body = removeStockSchema.parse(request.body);
        const result = await inventoryService.removeStock(body);

        return sendOk({
            reply,
            message: "Stock removed successfully",
            data: result,
        });
    }

    /**
     * Manual inventory adjustment.
     */
    async adjustStock(request: FastifyRequest, reply: FastifyReply) {
        const body = adjustStockSchema.parse(request.body);
        const result = await inventoryService.adjustStock(body);

        return sendOk({
            reply,
            message: "Inventory adjusted successfully",
            data: result,
        });
    }

    /**
     * Reserve stock for checkout.
     */
    async reserveStock(request: FastifyRequest, reply: FastifyReply) {
        const body = reserveStockSchema.parse(request.body);
        const result = await inventoryService.reserveStock(body);

        return sendCreated({
            reply,
            message: "Stock reserved successfully for checkout",
            data: result,
        });
    }

    /**
     * Confirm a reservation on payment completion.
     */
    async confirmReservation(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as ReservationParam;
        const body = confirmReservationSchema.parse(request.body ?? {});
        const result = await inventoryService.confirmReservation(id, body.orderId);

        return sendOk({
            reply,
            message: "Reservation confirmed and stock committed",
            data: result,
        });
    }

    /**
     * Release a reservation on payment failure or cancellation.
     */
    async releaseReservation(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as ReservationParam;
        const body = releaseReservationSchema.parse(request.body ?? {});
        const result = await inventoryService.releaseReservation(id, body.reason);

        return sendOk({
            reply,
            message: "Reservation released and stock restored",
            data: result,
        });
    }

    /**
     * Cleanup and expire stale reservations.
     */
    async cleanupExpired(request: FastifyRequest, reply: FastifyReply) {
        const result = await inventoryService.expireStaleReservations();

        return sendOk({
            reply,
            message: "Stale reservations cleanup completed",
            data: result,
        });
    }

    /**
     * Get transaction history.
     */
    async getTransactions(request: FastifyRequest, reply: FastifyReply) {
        const query = transactionQuerySchema.parse(request.query);
        const result = await inventoryService.getTransactions(query);

        return sendOk({
            reply,
            message: "Inventory transactions retrieved successfully",
            data: result,
        });
    }

    /**
     * Run simulated checkout & payment test flow.
     */
    async simulateCheckout(request: FastifyRequest, reply: FastifyReply) {
        const body = simulateCheckoutSchema.parse(request.body);
        const result = await inventoryService.simulateCheckout(body);

        return sendOk({
            reply,
            message: "Checkout simulation completed",
            data: result,
        });
    }
}

export const inventoryController = new InventoryController();
