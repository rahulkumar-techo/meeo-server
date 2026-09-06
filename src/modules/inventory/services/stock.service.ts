import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type {
    AddStockInput,
    RemoveStockInput,
    AdjustStockInput,
    InventoryQueryInput,
} from "../validations/inventory.validation.js";
import { Prisma } from "@/generated/prisma/client.js";

/**
 * Service managing stock levels, threshold alerts, and physical adjustments.
 */
export class StockService {
    /**
     * Get or initialize inventory for a specific product variant.
     */
    async getInventory(variantId: string) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: {
                product: {
                    select: { id: true, name: true, slug: true },
                },
                inventory: true,
            },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        // Auto-initialize inventory record if none exists
        let inventory = variant.inventory;
        if (!inventory) {
            inventory = await prisma.inventory.create({
                data: {
                    variantId,
                    availableQuantity: 0,
                    reservedQuantity: 0,
                    reorderLevel: 5,
                },
            });
        }

        const totalStock = inventory.availableQuantity + inventory.reservedQuantity;
        const isLowStock =
            inventory.reorderLevel !== null
                ? inventory.availableQuantity <= inventory.reorderLevel
                : false;

        return {
            ...inventory,
            variant: {
                id: variant.id,
                sku: variant.sku,
                barcode: variant.barcode,
                price: Number(variant.price),
                product: variant.product,
            },
            totalStock,
            isLowStock,
        };
    }

    /**
     * List all inventory records with pagination, search, and low-stock filters.
     */
    async listInventories(query: InventoryQueryInput) {
        const { page, limit, search, lowStockOnly } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.InventoryWhereInput = {};

        if (search) {
            where.variant = {
                is: {
                    OR: [
                        { sku: { contains: search, mode: "insensitive" } },
                        { barcode: { contains: search, mode: "insensitive" } },
                        { product: { is: { name: { contains: search, mode: "insensitive" } } } },
                    ],
                },
            };
        }

        const [items, total] = await Promise.all([
            prisma.inventory.findMany({
                where,
                skip,
                take: limit,
                include: {
                    variant: {
                        include: {
                            product: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
                orderBy: { updatedAt: "desc" },
            }),
            prisma.inventory.count({ where }),
        ]);

        const formatted = items.map((inv) => {
            const isLowStock =
                inv.reorderLevel !== null ? inv.availableQuantity <= inv.reorderLevel : false;
            return {
                ...inv,
                totalStock: inv.availableQuantity + inv.reservedQuantity,
                isLowStock,
                variant: {
                    id: inv.variant.id,
                    sku: inv.variant.sku,
                    barcode: inv.variant.barcode,
                    price: Number(inv.variant.price),
                    product: inv.variant.product,
                },
            };
        });

        // Filter for low stock if requested in query
        const filteredItems = lowStockOnly
            ? formatted.filter((item) => item.isLowStock)
            : formatted;

        return {
            items: filteredItems,
            pagination: {
                page,
                limit,
                total: lowStockOnly ? filteredItems.length : total,
                totalPages: Math.ceil((lowStockOnly ? filteredItems.length : total) / limit),
            },
        };
    }

    /**
     * List all variants currently at or below their reorder threshold.
     */
    async getLowStockAlerts(limit = 50) {
        const inventories = await prisma.inventory.findMany({
            where: {
                reorderLevel: { not: null },
            },
            take: limit,
            include: {
                variant: {
                    include: {
                        product: {
                            select: { id: true, name: true, slug: true },
                        },
                    },
                },
            },
            orderBy: { availableQuantity: "asc" },
        });

        return inventories
            .filter((inv) => inv.reorderLevel !== null && inv.availableQuantity <= inv.reorderLevel)
            .map((inv) => ({
                ...inv,
                totalStock: inv.availableQuantity + inv.reservedQuantity,
                deficit: (inv.reorderLevel ?? 0) - inv.availableQuantity,
                variant: {
                    id: inv.variant.id,
                    sku: inv.variant.sku,
                    barcode: inv.variant.barcode,
                    price: Number(inv.variant.price),
                    product: inv.variant.product,
                },
            }));
    }

    /**
     * Add physical stock to a variant and record a STOCK_ADDED transaction.
     */
    async addStock(input: AddStockInput) {
        const { variantId, quantity, note, referenceType, referenceId } = input;

        return await prisma.$transaction(async (tx) => {
            const variant = await tx.productVariant.findUnique({
                where: { id: variantId },
                include: { inventory: true },
            });

            if (!variant) {
                throw new AppError("Product variant not found", 404);
            }

            const inventory = await tx.inventory.upsert({
                where: { variantId },
                create: {
                    variantId,
                    availableQuantity: quantity,
                    reservedQuantity: 0,
                    reorderLevel: 5,
                },
                update: {
                    availableQuantity: { increment: quantity },
                },
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId,
                    type: "STOCK_ADDED",
                    quantity,
                    note: note ?? "Stock received and added to inventory",
                    referenceType: referenceType ?? "RESTOCK",
                    referenceId: referenceId ?? null,
                },
            });

            return {
                inventory,
                transaction,
            };
        });
    }

    /**
     * Remove stock (e.g. damages, shrinkage, write-offs) with overselling guard.
     */
    async removeStock(input: RemoveStockInput) {
        const { variantId, quantity, note, referenceType, referenceId } = input;

        return await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findUnique({
                where: { variantId },
            });

            if (!inventory) {
                throw new AppError("Inventory record not found for this variant", 404);
            }

            if (inventory.availableQuantity < quantity) {
                throw new AppError(
                    `Cannot remove ${quantity} units. Available stock is only ${inventory.availableQuantity}.`,
                    400,
                );
            }

            const updatedInventory = await tx.inventory.update({
                where: { variantId },
                data: {
                    availableQuantity: { decrement: quantity },
                },
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId,
                    type: "STOCK_REMOVED",
                    quantity,
                    note: note ?? "Stock removed from inventory",
                    referenceType: referenceType ?? "WRITE_OFF",
                    referenceId: referenceId ?? null,
                },
            });

            return {
                inventory: updatedInventory,
                transaction,
            };
        });
    }

    /**
     * Perform a manual inventory adjustment to synchronize actual stock counts.
     */
    async adjustStock(input: AdjustStockInput) {
        const { variantId, availableQuantity, reorderLevel, note } = input;

        return await prisma.$transaction(async (tx) => {
            const inventory = await tx.inventory.findUnique({
                where: { variantId },
            });

            if (!inventory) {
                throw new AppError("Inventory record not found for this variant", 404);
            }

            const updateData: Prisma.InventoryUpdateInput = {};
            let delta = 0;

            if (availableQuantity !== undefined) {
                delta = availableQuantity - inventory.availableQuantity;
                updateData.availableQuantity = availableQuantity;
            }

            if (reorderLevel !== undefined) {
                updateData.reorderLevel = reorderLevel;
            }

            const updatedInventory = await tx.inventory.update({
                where: { variantId },
                data: updateData,
            });

            const transaction = await tx.inventoryTransaction.create({
                data: {
                    variantId,
                    type: "MANUAL_ADJUSTMENT",
                    quantity: delta,
                    note:
                        note ??
                        `Manual adjustment: Available was ${inventory.availableQuantity}, set to ${updatedInventory.availableQuantity}`,
                    referenceType: "MANUAL_AUDIT",
                },
            });

            return {
                inventory: updatedInventory,
                transaction,
            };
        });
    }
}

export const stockService = new StockService();
