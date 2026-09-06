import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        productVariant: {
            findUnique: vi.fn(),
        },
        inventory: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
            count: vi.fn(),
        },
        inventoryReservation: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        inventoryTransaction: {
            findMany: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: unknown) => unknown) => {
            if (typeof callback === "function") {
                return callback(prismaMock);
            }
            return Promise.all(callback as unknown as Promise<unknown>[]);
        }),
    },
}));

vi.mock("@/lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import { InventoryService } from "@/modules/inventory/services/inventory.service.js";

describe("InventoryService Unit Tests", () => {
    let service: InventoryService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InventoryService();
    });

    describe("getInventory", () => {
        it("retrieves existing inventory and computes total stock and low-stock flag", async () => {
            const variantId = "var-1";
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: variantId,
                sku: "SKU-TEST-1",
                barcode: "123456",
                price: 99.99,
                product: { id: "p1", title: "Test Product", slug: "test-product" },
                inventory: {
                    id: "inv-1",
                    variantId,
                    availableQuantity: 3,
                    reservedQuantity: 2,
                    reorderLevel: 5,
                },
            });

            const result = await service.getInventory(variantId);

            expect(result.totalStock).toBe(5);
            expect(result.isLowStock).toBe(true);
            expect(result.variant.sku).toBe("SKU-TEST-1");
        });

        it("auto-initializes inventory if none exists for variant", async () => {
            const variantId = "var-2";
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: variantId,
                sku: "SKU-TEST-2",
                barcode: null,
                price: 49.99,
                product: { id: "p2", title: "Product 2", slug: "product-2" },
                inventory: null,
            });

            prismaMock.inventory.create.mockResolvedValue({
                id: "inv-new",
                variantId,
                availableQuantity: 0,
                reservedQuantity: 0,
                reorderLevel: 5,
            });

            const result = await service.getInventory(variantId);

            expect(prismaMock.inventory.create).toHaveBeenCalledWith({
                data: {
                    variantId,
                    availableQuantity: 0,
                    reservedQuantity: 0,
                    reorderLevel: 5,
                },
            });
            expect(result.totalStock).toBe(0);
            expect(result.isLowStock).toBe(true);
        });
    });

    describe("addStock", () => {
        it("increments available stock and records a STOCK_ADDED transaction", async () => {
            const variantId = "var-1";
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: variantId,
                sku: "SKU-ADD",
            });

            prismaMock.inventory.upsert.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 25,
                reservedQuantity: 0,
                reorderLevel: 5,
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({
                id: "tx-1",
                variantId,
                type: "STOCK_ADDED",
                quantity: 10,
                note: "Batch shipment #1",
            });

            const result = await service.addStock({
                variantId,
                quantity: 10,
                note: "Batch shipment #1",
                referenceType: "RESTOCK",
                referenceId: "PO-99",
            });

            expect(prismaMock.inventory.upsert).toHaveBeenCalled();
            expect(prismaMock.inventoryTransaction.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    variantId,
                    type: "STOCK_ADDED",
                    quantity: 10,
                    referenceType: "RESTOCK",
                }),
            });
            expect(result.inventory.availableQuantity).toBe(25);
        });
    });

    describe("removeStock (Overselling Guard)", () => {
        it("decrements stock when sufficient quantity is available", async () => {
            const variantId = "var-1";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 15,
                reservedQuantity: 0,
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({
                id: "tx-2",
                variantId,
                type: "STOCK_REMOVED",
                quantity: 5,
            });

            const result = await service.removeStock({
                variantId,
                quantity: 5,
                note: "Damaged box",
            });

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId },
                data: { availableQuantity: { decrement: 5 } },
            });
            expect(result.inventory.availableQuantity).toBe(10);
        });

        it("throws an error when trying to remove more stock than available", async () => {
            const variantId = "var-1";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 3,
                reservedQuantity: 0,
            });

            await expect(
                service.removeStock({
                    variantId,
                    quantity: 10,
                }),
            ).rejects.toThrow("Cannot remove 10 units. Available stock is only 3.");
        });
    });

    describe("reserveStock & Overselling Prevention", () => {
        it("reserves stock and shifts quantity from available to reserved", async () => {
            const variantId = "var-1";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 8,
                reservedQuantity: 2,
            });

            prismaMock.inventoryReservation.create.mockResolvedValue({
                id: "res-1",
                variantId,
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({
                id: "tx-res",
                variantId,
                type: "ORDER_RESERVED",
                quantity: 2,
            });

            const result = await service.reserveStock({
                variantId,
                quantity: 2,
                expiresInMinutes: 15,
            });

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId },
                data: {
                    availableQuantity: { decrement: 2 },
                    reservedQuantity: { increment: 2 },
                },
            });
            expect(result.reservation.status).toBe("ACTIVE");
            expect(result.inventory.availableQuantity).toBe(8);
            expect(result.inventory.reservedQuantity).toBe(2);
        });

        it("rejects reservation if requested quantity exceeds available stock", async () => {
            const variantId = "var-1";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-1",
                variantId,
                availableQuantity: 1,
                reservedQuantity: 0,
            });

            await expect(
                service.reserveStock({
                    variantId,
                    quantity: 5,
                    expiresInMinutes: 15,
                }),
            ).rejects.toThrow("Insufficient stock to reserve");
        });
    });

    describe("confirmReservation (Payment Success)", () => {
        it("confirms reservation, reduces reservedQuantity, and creates ORDER_CONFIRMED transaction", async () => {
            const resId = "res-1";
            prismaMock.inventoryReservation.findUnique.mockResolvedValue({
                id: resId,
                variantId: "var-1",
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                orderId: null,
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-1",
                variantId: "var-1",
                availableQuantity: 8,
                reservedQuantity: 0,
            });

            prismaMock.inventoryReservation.update.mockResolvedValue({
                id: resId,
                status: "CONFIRMED",
                orderId: "order-123",
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({
                id: "tx-confirm",
                type: "ORDER_CONFIRMED",
            });

            const result = await service.confirmReservation(resId, "order-123");

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId: "var-1" },
                data: { reservedQuantity: { decrement: 2 } },
            });
            expect(result.reservation.status).toBe("CONFIRMED");
        });

        it("rejects confirmation if reservation has already expired", async () => {
            const resId = "res-expired";
            prismaMock.inventoryReservation.findUnique.mockResolvedValue({
                id: resId,
                variantId: "var-1",
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() - 1000), // in the past
            });

            await expect(service.confirmReservation(resId)).rejects.toThrow(
                "Reservation has expired",
            );
        });
    });

    describe("releaseReservation (Payment Failed / Cancelled)", () => {
        it("releases reservation, restores available quantity, and logs ORDER_CANCELLED", async () => {
            const resId = "res-release";
            prismaMock.inventoryReservation.findUnique.mockResolvedValue({
                id: resId,
                variantId: "var-1",
                quantity: 3,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-1",
                variantId: "var-1",
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventoryReservation.update.mockResolvedValue({
                id: resId,
                status: "RELEASED",
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({
                id: "tx-rel",
                type: "ORDER_CANCELLED",
            });

            const result = await service.releaseReservation(resId, "Payment declined");

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId: "var-1" },
                data: {
                    availableQuantity: { increment: 3 },
                    reservedQuantity: { decrement: 3 },
                },
            });
            expect(result.reservation.status).toBe("RELEASED");
        });
    });

    describe("simulateCheckout Test Flow", () => {
        it("simulates complete successful checkout: Reserve -> Payment Success -> Confirm", async () => {
            const variantId = "var-sim";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-sim",
                variantId,
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-sim",
                variantId,
                availableQuantity: 8,
                reservedQuantity: 0,
            });

            prismaMock.inventoryReservation.create.mockResolvedValue({
                id: "res-sim",
                variantId,
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            prismaMock.inventoryReservation.findUnique.mockResolvedValue({
                id: "res-sim",
                variantId,
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            prismaMock.inventoryReservation.update.mockResolvedValue({
                id: "res-sim",
                status: "CONFIRMED",
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({ id: "tx-sim" });

            const result = await service.simulateCheckout({
                variantId,
                quantity: 2,
                simulatePaymentSuccess: true,
                holdMinutes: 15,
            });

            expect(result.flowStatus).toBe("ORDER_COMPLETED");
            expect(result.timeline).toHaveLength(3);
            expect(result.timeline[0]?.action).toBe("STOCK_RESERVED");
            expect(result.timeline[1]?.action).toBe("SIMULATED_PAYMENT");
            expect(result.timeline[2]?.action).toBe("RESERVATION_CONFIRMED");
        });

        it("simulates failed checkout: Reserve -> Payment Fail -> Release Stock", async () => {
            const variantId = "var-sim-fail";
            prismaMock.inventory.findUnique.mockResolvedValue({
                id: "inv-sim",
                variantId,
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventory.update.mockResolvedValue({
                id: "inv-sim",
                variantId,
                availableQuantity: 10,
                reservedQuantity: 0,
            });

            prismaMock.inventoryReservation.create.mockResolvedValue({
                id: "res-sim-fail",
                variantId,
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            prismaMock.inventoryReservation.findUnique.mockResolvedValue({
                id: "res-sim-fail",
                variantId,
                quantity: 2,
                status: "ACTIVE",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            prismaMock.inventoryReservation.update.mockResolvedValue({
                id: "res-sim-fail",
                status: "RELEASED",
            });

            prismaMock.inventoryTransaction.create.mockResolvedValue({ id: "tx-sim" });

            const result = await service.simulateCheckout({
                variantId,
                quantity: 2,
                simulatePaymentSuccess: false,
                holdMinutes: 15,
            });

            expect(result.flowStatus).toBe("ORDER_CANCELLED_RESTORED");
            expect(result.timeline).toHaveLength(3);
            expect(result.timeline[1]?.status).toBe("FAILED");
            expect(result.timeline[2]?.action).toBe("RESERVATION_RELEASED");
        });
    });
});
