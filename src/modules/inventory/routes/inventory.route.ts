import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { inventoryController } from "../controller/inventory.controller.js";
import { inventorySchemas } from "@/common/docs/inventory.js";

/**
 * Registers Inventory Management routes under /api/inventory.
 */
export default async function inventoryRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Stock Level & Inventory Status Endpoints
    // ----------------------------------------------------
    app.get(
        "/variant/:variantId",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_READ),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:read] Get variant stock",
                description: "Retrieves current available, reserved, and total stock counts for a specific product variant.",
                security: [{ bearerAuth: [] }],
                params: inventorySchemas.variantParams,
            },
        },
        inventoryController.getInventory.bind(inventoryController),
    );

    app.get(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_READ),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:read] List all inventory",
                description: "Lists all variant inventory levels with search, pagination, and low-stock filtering.",
                security: [{ bearerAuth: [] }],
            },
        },
        inventoryController.listInventories.bind(inventoryController),
    );

    app.get(
        "/low-stock",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_READ),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:read] Low stock alerts",
                description: "Lists all product variants whose available stock is at or below their reorder threshold.",
                security: [{ bearerAuth: [] }],
            },
        },
        inventoryController.getLowStockAlerts.bind(inventoryController),
    );

    // ----------------------------------------------------
    // Stock Movement & Adjustment Endpoints
    // ----------------------------------------------------
    app.post(
        "/add-stock",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:update] Add physical stock",
                description: "Adds stock units to a variant and logs an immutable `STOCK_ADDED` transaction.",
                security: [{ bearerAuth: [] }],
                body: inventorySchemas.addStock,
            },
        },
        inventoryController.addStock.bind(inventoryController),
    );

    app.post(
        "/remove-stock",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:update] Remove stock (shrinkage/damaged)",
                description: "Removes stock with overselling protection and logs a `STOCK_REMOVED` transaction.",
                security: [{ bearerAuth: [] }],
                body: inventorySchemas.removeStock,
            },
        },
        inventoryController.removeStock.bind(inventoryController),
    );

    app.post(
        "/adjust",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:update] Manual stock adjustment",
                description: "Synchronizes physical stock count or updates reorder levels with an audit note.",
                security: [{ bearerAuth: [] }],
                body: inventorySchemas.adjustStock,
            },
        },
        inventoryController.adjustStock.bind(inventoryController),
    );

    // ----------------------------------------------------
    // Immutable Audit Ledger Endpoints
    // ----------------------------------------------------
    app.get(
        "/transactions",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_READ),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:read] List inventory transactions",
                description: "Retrieves paginated immutable stock movement audit logs with filters for variant, transaction type, and date range.",
                security: [{ bearerAuth: [] }],
            },
        },
        inventoryController.getTransactions.bind(inventoryController),
    );

    // ----------------------------------------------------
    // Reservation Lifecycle & Overselling Protection Endpoints
    // ----------------------------------------------------
    app.post(
        "/reservations/reserve",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Authenticated User] Reserve stock for checkout",
                description: "Temporarily locks available stock for checkout. Prevents overselling with a configurable TTL window (default: 15 minutes).",
                security: [{ bearerAuth: [] }],
                body: inventorySchemas.reserveStock,
            },
        },
        inventoryController.reserveStock.bind(inventoryController),
    );

    app.post(
        "/reservations/:id/confirm",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:update] Confirm reservation on payment",
                description: "Permanently commits reserved stock when payment succeeds.",
                security: [{ bearerAuth: [] }],
                params: inventorySchemas.reservationParams,
                body: inventorySchemas.confirmReservation,
            },
        },
        inventoryController.confirmReservation.bind(inventoryController),
    );

    app.post(
        "/reservations/:id/release",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Authenticated User] Release stock reservation",
                description: "Releases held stock back into the available pool when payment fails or checkout is cancelled.",
                security: [{ bearerAuth: [] }],
                params: inventorySchemas.reservationParams,
                body: inventorySchemas.releaseReservation,
            },
        },
        inventoryController.releaseReservation.bind(inventoryController),
    );

    app.post(
        "/reservations/cleanup-expired",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.INVENTORY_UPDATE),
            ],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Admin: inventory:update] Cleanup expired reservations",
                description: "Sweeper endpoint to auto-expire stale reservations and restore available stock.",
                security: [{ bearerAuth: [] }],
            },
        },
        inventoryController.cleanupExpired.bind(inventoryController),
    );

    // ----------------------------------------------------
    // Checkout & Payment Simulation Flow (Testing)
    // ----------------------------------------------------
    app.post(
        "/checkout/simulate",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Inventory - Stock & Reservations"],
                summary: "[Authenticated User] Simulate checkout & payment flow",
                description: "Simulates full end-to-end checkout flow (Reserve Stock -> Simulated Payment Success/Fail -> Confirm or Release) for testing and development.",
                security: [{ bearerAuth: [] }],
                body: inventorySchemas.simulateCheckout,
            },
        },
        inventoryController.simulateCheckout.bind(inventoryController),
    );
}
