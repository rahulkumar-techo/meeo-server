import { stockService } from "./stock.service.js";
import { reservationService } from "./reservation.service.js";
import { transactionService } from "./transaction.service.js";
import { checkoutSimulationService } from "./checkoutSimulation.service.js";
import type {
    AddStockInput,
    RemoveStockInput,
    AdjustStockInput,
    ReserveStockInput,
    InventoryQueryInput,
    TransactionQueryInput,
    SimulateCheckoutInput,
} from "../validations/inventory.validation.js";

/**
 * Unified facade service for Inventory Management.
 * Delegates to modular sub-services for stock levels, reservations, audit logs, and checkout simulations.
 */
export class InventoryService {
    // ----------------------------------------------------
    // Stock Operations (StockService)
    // ----------------------------------------------------
    async getInventory(variantId: string) {
        return stockService.getInventory(variantId);
    }

    async listInventories(query: InventoryQueryInput) {
        return stockService.listInventories(query);
    }

    async getLowStockAlerts(limit = 50) {
        return stockService.getLowStockAlerts(limit);
    }

    async addStock(input: AddStockInput) {
        return stockService.addStock(input);
    }

    async removeStock(input: RemoveStockInput) {
        return stockService.removeStock(input);
    }

    async adjustStock(input: AdjustStockInput) {
        return stockService.adjustStock(input);
    }

    // ----------------------------------------------------
    // Reservation Operations (ReservationService)
    // ----------------------------------------------------
    async reserveStock(input: ReserveStockInput) {
        return reservationService.reserveStock(input);
    }

    async confirmReservation(reservationId: string, orderId?: string) {
        return reservationService.confirmReservation(reservationId, orderId);
    }

    async releaseReservation(reservationId: string, reason?: string) {
        return reservationService.releaseReservation(reservationId, reason);
    }

    async expireStaleReservations() {
        return reservationService.expireStaleReservations();
    }

    // ----------------------------------------------------
    // Audit Ledger Transactions (TransactionService)
    // ----------------------------------------------------
    async getTransactions(query: TransactionQueryInput) {
        return transactionService.getTransactions(query);
    }

    // ----------------------------------------------------
    // Checkout & Payment Simulation (CheckoutSimulationService)
    // ----------------------------------------------------
    async simulateCheckout(input: SimulateCheckoutInput) {
        return checkoutSimulationService.simulateCheckout(input);
    }
}

export const inventoryService = new InventoryService();

// Re-export modular services for direct specialized usage
export { stockService, reservationService, transactionService, checkoutSimulationService };
