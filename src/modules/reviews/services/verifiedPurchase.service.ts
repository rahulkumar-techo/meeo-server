import { prisma } from "@/lib/prisma.js";

const VALID_PURCHASE_STATUSES = [
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
] as const;

/**
 * Service to determine if a customer has legitimately bought and paid for a product.
 */
export class VerifiedPurchaseService {
    /**
     * Check if a user has at least one valid confirmed/fulfilled order containing the specified product.
     */
    static async checkVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
        if (!userId || !productId) return false;

        const purchase = await prisma.orderItem.findFirst({
            where: {
                productId,
                order: {
                    userId,
                    status: { in: [...VALID_PURCHASE_STATUSES] },
                },
            },
            select: { id: true },
        });

        return Boolean(purchase);
    }
}
