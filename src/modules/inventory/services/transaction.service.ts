import { prisma } from "@/lib/prisma.js";
import type { TransactionQueryInput } from "../validations/inventory.validation.js";
import { Prisma } from "@/generated/prisma/client.js";

/**
 * Service managing immutable inventory audit log transactions.
 */
export class TransactionService {
    /**
     * Retrieve paginated immutable transaction history with filters.
     */
    async getTransactions(query: TransactionQueryInput) {
        const { variantId, type, referenceType, referenceId, page, limit, startDate, endDate } =
            query;
        const skip = (page - 1) * limit;

        const where: Prisma.InventoryTransactionWhereInput = {};

        if (variantId) where.variantId = variantId;
        if (type) where.type = type;
        if (referenceType) where.referenceType = referenceType;
        if (referenceId) where.referenceId = referenceId;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [items, total] = await Promise.all([
            prisma.inventoryTransaction.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    variant: {
                        select: {
                            id: true,
                            sku: true,
                            barcode: true,
                            product: {
                                select: { id: true, name: true },
                            },
                        },
                    },
                },
            }),
            prisma.inventoryTransaction.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

export const transactionService = new TransactionService();
