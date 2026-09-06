import { prisma } from "@/lib/prisma.js";
import type {
    DashboardPeriodQueryInput,
    SalesTrendQueryInput,
    LowStockAlertsQueryInput,
    TopSellersQueryInput,
    FailedPaymentsQueryInput,
} from "../validations/dashboard.validation.js";

export class DashboardService {
    /**
     * Resolves datetime range from period shorthand or explicit dates.
     */
    private resolveDateRange(period?: string, startDate?: string, endDate?: string): { gte?: Date; lte?: Date } {
        if (startDate || endDate) {
            const range: { gte?: Date; lte?: Date } = {};
            if (startDate) range.gte = new Date(startDate);
            if (endDate) range.lte = new Date(endDate);
            return range;
        }

        const now = new Date();
        if (period === "today") {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            return { gte: startOfDay, lte: now };
        }
        if (period === "7d") {
            return { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), lte: now };
        }
        if (period === "30d") {
            return { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), lte: now };
        }
        if (period === "90d") {
            return { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), lte: now };
        }
        if (period === "1y") {
            return { gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000), lte: now };
        }

        return {}; // "all"
    }

    /**
     * High-level Executive KPI Overview across Revenue, Orders, Users, Inventory, Payments, and Reviews.
     */
    async getExecutiveOverview(query: DashboardPeriodQueryInput) {
        const dateFilter = this.resolveDateRange(query.period, query.startDate, query.endDate);
        const orderWhereDate = dateFilter.gte ? { createdAt: dateFilter } : {};
        const paymentWhereDate = dateFilter.gte ? { initiatedAt: dateFilter } : {};
        const refundWhereDate = dateFilter.gte ? { requestedAt: dateFilter } : {};

        // 1. Parallel Aggregations
        const [
            allOrders,
            refundsAgg,
            userCounts,
            newUsersCount,
            inventoryList,
            paymentAttempts,
            reviewCounts,
            pendingReportsCount,
            activeCouponsCount,
        ] = await Promise.all([
            // A. Orders
            prisma.order.findMany({
                where: orderWhereDate,
                select: {
                    id: true,
                    status: true,
                    grandTotal: true,
                    subtotal: true,
                    discountTotal: true,
                    createdAt: true,
                },
            }),
            // B. Refunds
            prisma.refund.aggregate({
                where: {
                    status: "SUCCESS",
                    ...refundWhereDate,
                },
                _sum: { amount: true },
            }),
            // C. Users Breakdown
            Promise.all([
                prisma.user.count(),
                prisma.user.count({ where: { status: "ACTIVE" } }),
                prisma.user.count({ where: { status: "SUSPENDED" } }),
                prisma.user.count({ where: { status: "BLOCKED" } }),
            ]),
            // D. New Users in Period
            prisma.user.count({
                where: orderWhereDate,
            }),
            // E. Inventory Breakdown
            prisma.inventory.findMany({
                select: {
                    availableQuantity: true,
                    reservedQuantity: true,
                    reorderLevel: true,
                    variant: { select: { id: true, status: true } },
                },
            }),
            // F. Payment Attempts in Period
            prisma.paymentAttempt.findMany({
                where: paymentWhereDate,
                select: {
                    id: true,
                    status: true,
                    payment: { select: { provider: true } },
                },
            }),
            // G. Review Metrics
            Promise.all([
                prisma.review.count(),
                prisma.review.count({ where: { status: "PENDING" } }),
                prisma.review.count({ where: { status: "APPROVED" } }),
                prisma.review.count({ where: { status: "REJECTED" } }),
                prisma.review.aggregate({
                    where: { status: "APPROVED" },
                    _avg: { rating: true },
                }),
            ]),
            // H. Pending Abuse Reports
            prisma.reviewReport.count({ where: { status: "PENDING" } }),
            // I. Active Coupons
            prisma.coupon.count({ where: { status: "ACTIVE" } }),
        ]);

        // 2. Compute Revenue & Orders KPIs
        const totalOrders = allOrders.length;
        const statusBreakdown: Record<string, number> = {
            PENDING: 0,
            PAYMENT_PENDING: 0,
            CONFIRMED: 0,
            PROCESSING: 0,
            SHIPPED: 0,
            DELIVERED: 0,
            CANCELLED: 0,
            EXPIRED: 0,
            REFUNDED: 0,
        };

        let grossRevenue = 0;
        let totalDiscountGranted = 0;
        let successfulOrderCount = 0;

        const PAID_ORDER_STATUSES = new Set(["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);

        for (const ord of allOrders) {
            statusBreakdown[ord.status] = (statusBreakdown[ord.status] || 0) + 1;
            if (PAID_ORDER_STATUSES.has(ord.status)) {
                grossRevenue += Number(ord.grandTotal);
                totalDiscountGranted += Number(ord.discountTotal);
                successfulOrderCount++;
            }
        }

        const totalRefunds = Number(refundsAgg?._sum?.amount ?? 0);
        const netRevenue = Number((grossRevenue - totalRefunds).toFixed(2));
        const averageOrderValue =
            successfulOrderCount > 0
                ? Number((grossRevenue / successfulOrderCount).toFixed(2))
                : 0;
        const deliveredCount = statusBreakdown["DELIVERED"] ?? 0;
        const fulfillmentRate =
            totalOrders > 0
                ? Number(((deliveredCount / totalOrders) * 100).toFixed(1))
                : 0;

        // 3. Compute User KPIs
        const [totalUsers, activeUsers, suspendedUsers, blockedUsers] = userCounts;

        // 4. Compute Inventory KPIs
        let totalPhysicalUnits = 0;
        let totalReservedUnits = 0;
        let outOfStockCount = 0;
        let lowStockCount = 0;
        let inStockCount = 0;

        for (const inv of inventoryList) {
            totalPhysicalUnits += inv.availableQuantity;
            totalReservedUnits += inv.reservedQuantity;
            const threshold = inv.reorderLevel ?? 10;

            if (inv.availableQuantity <= 0) {
                outOfStockCount++;
            } else if (inv.availableQuantity <= threshold) {
                lowStockCount++;
                inStockCount++;
            } else {
                inStockCount++;
            }
        }

        // 5. Compute Payment KPIs
        const totalPaymentAttempts = paymentAttempts.length;
        let successfulPayments = 0;
        let failedPayments = 0;
        const gatewayBreakdown: Record<string, number> = {};

        for (const att of paymentAttempts) {
            const provider = att.payment?.provider ?? "UNKNOWN";
            gatewayBreakdown[provider] = (gatewayBreakdown[provider] || 0) + 1;
            if (att.status === "SUCCESS") successfulPayments++;
            if (att.status === "FAILED") failedPayments++;
        }

        const paymentFailureRate =
            totalPaymentAttempts > 0
                ? Number(((failedPayments / totalPaymentAttempts) * 100).toFixed(1))
                : 0;

        // 6. Compute Review KPIs
        const [totalReviews, pendingReviews, approvedReviews, rejectedReviews, ratingAgg] = reviewCounts;

        return {
            period: query.period ?? "30d",
            revenue: {
                grossRevenue: Number(grossRevenue.toFixed(2)),
                netRevenue,
                totalRefunds,
                totalDiscountGranted: Number(totalDiscountGranted.toFixed(2)),
                averageOrderValue,
            },
            orders: {
                totalOrders,
                successfulOrders: successfulOrderCount,
                fulfillmentRate,
                statusBreakdown,
            },
            users: {
                totalUsers,
                activeUsers,
                suspendedUsers,
                blockedUsers,
                newUsersInPeriod: newUsersCount,
            },
            inventory: {
                totalTrackedVariants: inventoryList.length,
                totalPhysicalUnits,
                totalReservedUnits,
                inStockCount,
                lowStockCount,
                outOfStockCount,
            },
            payments: {
                totalAttempts: totalPaymentAttempts,
                successfulPayments,
                failedPayments,
                failureRate: paymentFailureRate,
                gatewayBreakdown,
            },
            reviews: {
                totalReviews,
                pendingModeration: pendingReviews,
                approvedReviews,
                rejectedReviews,
                pendingAbuseReports: pendingReportsCount,
                averagePlatformRating: Number((ratingAgg._avg.rating ?? 0).toFixed(1)),
            },
            promotions: {
                activeCouponsCount,
            },
        };
    }

    /**
     * Time-series sales and revenue aggregation for frontend charts.
     */
    async getSalesAndRevenueChart(query: SalesTrendQueryInput) {
        const dateFilter = this.resolveDateRange(query.period);
        const orders = await prisma.order.findMany({
            where: {
                status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
                ...(dateFilter.gte ? { createdAt: dateFilter } : {}),
            },
            select: {
                grandTotal: true,
                createdAt: true,
            },
            orderBy: { createdAt: "asc" },
        });

        const buckets: Record<string, { date: string; revenue: number; orderCount: number }> = {};

        for (const ord of orders) {
            let key: string;
            const d = ord.createdAt;
            if (query.interval === "month") {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            } else if (query.interval === "week") {
                // ISO week approximation
                const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
                const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
            } else {
                // Day (YYYY-MM-DD)
                key = d.toISOString().slice(0, 10);
            }

            if (!buckets[key]) {
                buckets[key] = { date: key, revenue: 0, orderCount: 0 };
            }
            const currentBucket = buckets[key]!;
            currentBucket.revenue += Number(ord.grandTotal);
            currentBucket.orderCount += 1;
        }

        const dataPoints = Object.values(buckets).map((b) => ({
            ...b,
            revenue: Number(b.revenue.toFixed(2)),
        }));

        return {
            period: query.period,
            interval: query.interval,
            dataPoints,
        };
    }

    /**
     * Retrieves top-selling products ranked by units sold and gross revenue.
     */
    async getTopSellingProducts(query: TopSellersQueryInput) {
        const dateFilter = this.resolveDateRange(query.period);
        const limit = query.limit ?? 10;

        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
                    ...(dateFilter.gte ? { createdAt: dateFilter } : {}),
                },
            },
            select: {
                productId: true,
                productName: true,
                quantity: true,
                total: true,
                variant: {
                    select: {
                        id: true,
                        sku: true,
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                images: { take: 1, select: { url: true } },
                            },
                        },
                    },
                },
            },
        });

        const productSales: Record<
            string,
            {
                productId: string;
                name: string;
                slug: string;
                thumbnail: string | null;
                unitsSold: number;
                totalRevenue: number;
            }
        > = {};

        for (const item of orderItems) {
            const pid = item.productId ?? item.variant?.product?.id ?? "unknown";
            if (!productSales[pid]) {
                productSales[pid] = {
                    productId: pid,
                    name: item.variant?.product?.name ?? item.productName,
                    slug: item.variant?.product?.slug ?? "",
                    thumbnail: item.variant?.product?.images[0]?.url ?? null,
                    unitsSold: 0,
                    totalRevenue: 0,
                };
            }
            const rec = productSales[pid]!;
            rec.unitsSold += item.quantity;
            rec.totalRevenue += Number(item.total);
        }

        const topSellers = Object.values(productSales)
            .sort((a, b) => b.unitsSold - a.unitsSold || b.totalRevenue - a.totalRevenue)
            .slice(0, limit)
            .map((p) => ({
                ...p,
                totalRevenue: Number(p.totalRevenue.toFixed(2)),
            }));

        return topSellers;
    }

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

export const dashboardService = new DashboardService();
