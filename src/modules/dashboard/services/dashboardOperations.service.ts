import { prisma } from "@/lib/prisma.js";
import type {
    LowStockAlertsQueryInput,
    FailedPaymentsQueryInput,
} from "../validations/dashboard.validation.js";

export class DashboardOperationsService {
    /**
     * Lists inventory variants currently at or below the low stock threshold.
     */
    async getLowStockAlerts(query: LowStockAlertsQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const threshold = query.threshold ?? 10;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.inventory.findMany({
                where: {
                    availableQuantity: { lte: threshold },
                },
                skip,
                take: limit,
                orderBy: { availableQuantity: "asc" },
                include: {
                    variant: {
                        include: {
                            product: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            }),
            prisma.inventory.count({
                where: {
                    availableQuantity: { lte: threshold },
                },
            }),
        ]);

        return {
            items: items.map((inv) => ({
                inventoryId: inv.id,
                variantId: inv.variantId,
                sku: inv.variant.sku,
                productName: inv.variant.product.name,
                productId: inv.variant.product.id,
                productSlug: inv.variant.product.slug,
                price: Number(inv.variant.price),
                availableQuantity: inv.availableQuantity,
                reservedQuantity: inv.reservedQuantity,
                reorderLevel: inv.reorderLevel ?? threshold,
                isOutOfStock: inv.availableQuantity <= 0,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Lists recent failed payment attempts with gateway reason codes for fraud/integration troubleshooting.
     */
    async getRecentFailedPayments(query: FailedPaymentsQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            prisma.paymentAttempt.findMany({
                where: {
                    status: "FAILED",
                },
                skip,
                take: limit,
                orderBy: { initiatedAt: "desc" },
                include: {
                    payment: {
                        include: {
                            order: {
                                select: {
                                    id: true,
                                    orderNumber: true,
                                    grandTotal: true,
                                    user: { select: { id: true, email: true, firstName: true, lastName: true } },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.paymentAttempt.count({
                where: { status: "FAILED" },
            }),
        ]);

        return {
            items: items.map((att) => ({
                attemptId: att.id,
                paymentId: att.paymentId,
                provider: att.payment.provider,
                errorCode: att.failureCode,
                errorMessage: att.failureMessage,
                attemptNumber: att.attemptNumber,
                amount: Number(att.amount),
                currency: att.payment.currency,
                orderId: att.payment.orderId,
                orderNumber: att.payment.order.orderNumber,
                customerEmail: att.payment.order.user?.email ?? "",
                customerName: `${att.payment.order.user?.firstName ?? ""} ${att.payment.order.user?.lastName ?? ""}`.trim(),
                createdAt: att.initiatedAt,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Real-time operational backlog health check.
     */
    async getOperationalHealth() {
        const [
            pendingOutboxEvents,
            failedOutboxEvents,
            pendingReviewModeration,
            pendingReviewReports,
            unfulfilledOrders,
            lowStockCount,
        ] = await Promise.all([
            prisma.outboxEvent.count({ where: { status: "PENDING" } }),
            prisma.outboxEvent.count({ where: { status: "FAILED" } }),
            prisma.review.count({ where: { status: "PENDING" } }),
            prisma.reviewReport.count({ where: { status: "PENDING" } }),
            prisma.order.count({ where: { status: { in: ["CONFIRMED", "PROCESSING"] } } }),
            prisma.inventory.count({ where: { availableQuantity: { lte: 10 } } }),
        ]);

        const isHealthy = failedOutboxEvents === 0 && pendingOutboxEvents < 100;

        return {
            status: isHealthy ? "HEALTHY" : "DEGRADED",
            timestamp: new Date().toISOString(),
            backlogs: {
                pendingOutboxEvents,
                failedOutboxEvents,
                pendingReviewModeration,
                pendingReviewReports,
                unfulfilledOrders,
                lowStockCount,
            },
        };
    }
}

export const dashboardOperationsService = new DashboardOperationsService();
