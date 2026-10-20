import { prisma } from "@/lib/prisma.js";
import { Prisma } from "@/generated/prisma/client.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_TTL } from "@/common/cache/cache.keys.js";
import { dashboardAnalyticsService } from "./dashboardAnalytics.service.js";
import { dashboardOperationsService } from "./dashboardOperations.service.js";
import type {
    DashboardPeriodQueryInput,
    SalesTrendQueryInput,
    LowStockAlertsQueryInput,
    TopSellersQueryInput,
    FailedPaymentsQueryInput,
} from "../validations/dashboard.validation.js";

export { dashboardAnalyticsService } from "./dashboardAnalytics.service.js";
export { dashboardOperationsService } from "./dashboardOperations.service.js";

export class DashboardService {
    /**
     * Resolves datetime range from period shorthand or explicit dates.
     */
    private resolveDateRange(period?: string, startDate?: string, endDate?: string): { gte?: Date; lte?: Date } {
        return dashboardAnalyticsService.resolveDateRange(period, startDate, endDate);
    }

    /**
     * High-level Executive KPI Overview across Revenue, Orders, Users, Inventory, Payments, and Reviews.
     */
    async getExecutiveOverview(query: DashboardPeriodQueryInput) {
        const cacheKey = `cache:dashboard:overview:${query.period ?? "30d"}:${query.startDate ?? ""}:${query.endDate ?? ""}`;
        const cached = await cacheService.get<any>(cacheKey);
        if (cached) {
            return cached;
        }

        const dateFilter = this.resolveDateRange(query.period, query.startDate, query.endDate);
        const orderWhereDate = dateFilter.gte ? { createdAt: dateFilter } : {};
        const paymentWhereDate = dateFilter.gte ? { initiatedAt: dateFilter } : {};
        const refundWhereDate = dateFilter.gte ? { requestedAt: dateFilter } : {};
        const userWhereDate = {
            deletedAt: null,
            ...(dateFilter.gte ? { createdAt: dateFilter } : {}),
        };

        const paymentWhereSql = dateFilter.gte
            ? Prisma.sql`WHERE pa."initiatedAt" >= ${dateFilter.gte} ${dateFilter.lte ? Prisma.sql`AND pa."initiatedAt" <= ${dateFilter.lte}` : Prisma.empty}`
            : Prisma.empty;

        const [
            orderGroups,
            refundsAgg,
            userGroups,
            newUsersCount,
            inventoryStatsRows,
            paymentAttemptRows,
            reviewGroups,
            ratingAgg,
            pendingReportsCount,
            activeCouponsCount,
        ] = await Promise.all([
            // 1. Order status counts and revenue sums (P0: replace order.findMany with groupBy)
            prisma.order.groupBy({
                by: ["status"],
                where: orderWhereDate,
                _count: { id: true },
                _sum: { grandTotal: true, discountTotal: true },
            }),

            // 2. Refunds aggregate
            prisma.refund.aggregate({
                where: {
                    status: "SUCCESS",
                    ...refundWhereDate,
                },
                _sum: { amount: true },
            }),

            // 3. User status grouping (P1: consolidate 4 user count queries into 1 groupBy)
            prisma.user.groupBy({
                by: ["status"],
                where: { deletedAt: null },
                _count: { _all: true },
            }),

            // 4. New users registered in period (P1: dedicated createdAt filter and deletedAt: null)
            prisma.user.count({
                where: userWhereDate,
            }),

            // 5. Inventory unit totals & conditional stock counts (P0: eliminate inventory.findMany)
            prisma.$queryRaw<Array<{
                totalTrackedVariants: number | bigint;
                totalPhysicalUnits: number | bigint;
                totalReservedUnits: number | bigint;
                outOfStockCount: number | bigint;
                lowStockCount: number | bigint;
                inStockCount: number | bigint;
            }>>`
                SELECT 
                    COUNT(*)::int AS "totalTrackedVariants",
                    COALESCE(SUM("availableQuantity"), 0)::bigint::int AS "totalPhysicalUnits",
                    COALESCE(SUM("reservedQuantity"), 0)::bigint::int AS "totalReservedUnits",
                    COUNT(CASE WHEN "availableQuantity" <= 0 THEN 1 END)::int AS "outOfStockCount",
                    COUNT(CASE WHEN "availableQuantity" > 0 AND "availableQuantity" <= COALESCE("reorderLevel", 10) THEN 1 END)::int AS "lowStockCount",
                    COUNT(CASE WHEN "availableQuantity" > 0 THEN 1 END)::int AS "inStockCount"
                FROM "inventory";
            `,

            // 6. Payment attempts status & provider grouping with join (P0: eliminate paymentAttempt.findMany)
            prisma.$queryRaw<Array<{
                status: string;
                provider: string | null;
                count: number | bigint;
            }>>`
                SELECT 
                    pa.status::text AS status,
                    p.provider::text AS provider,
                    COUNT(*)::int AS count
                FROM "payment_attempts" pa
                LEFT JOIN "payments" p ON pa."paymentId" = p.id
                ${paymentWhereSql}
                GROUP BY pa.status, p.provider;
            `,

            // 7. Review status grouping (P1: consolidate 4 review count queries into 1 groupBy)
            prisma.review.groupBy({
                by: ["status"],
                _count: { id: true },
            }),

            // 8. Approved reviews average rating
            prisma.review.aggregate({
                where: { status: "APPROVED" },
                _avg: { rating: true },
            }),

            // 9. Pending abuse reports
            prisma.reviewReport.count({ where: { status: "PENDING" } }),

            // 10. Active coupons
            prisma.coupon.count({ where: { status: "ACTIVE" } }),
        ]);

        // Process Orders
        let totalOrders = 0;
        let grossRevenue = 0;
        let totalDiscountGranted = 0;
        let successfulOrderCount = 0;
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
        // Business revenue considers CONFIRMED, PROCESSING, SHIPPED, DELIVERED orders
        const PAID_ORDER_STATUSES = new Set(["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);

        if (Array.isArray(orderGroups)) {
            for (const group of orderGroups) {
                const count = group._count?.id ?? 0;
                totalOrders += count;
                statusBreakdown[group.status] = count;
                if (PAID_ORDER_STATUSES.has(group.status)) {
                    grossRevenue += Number(group._sum?.grandTotal ?? 0);
                    totalDiscountGranted += Number(group._sum?.discountTotal ?? 0);
                    successfulOrderCount += count;
                }
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

        // Process Users
        let totalUsers = 0;
        let activeUsers = 0;
        let suspendedUsers = 0;
        let blockedUsers = 0;

        if (Array.isArray(userGroups)) {
            for (const g of userGroups) {
                const count = g._count?._all ?? 0;
                totalUsers += count;
                if (g.status === "ACTIVE") activeUsers = count;
                else if (g.status === "SUSPENDED") suspendedUsers = count;
                else if (g.status === "BLOCKED") blockedUsers = count;
            }
        }

        // Process Inventory
        const invRow = Array.isArray(inventoryStatsRows) ? inventoryStatsRows[0] : null;
        const totalTrackedVariants = Number(invRow?.totalTrackedVariants ?? 0);
        const totalPhysicalUnits = Number(invRow?.totalPhysicalUnits ?? 0);
        const totalReservedUnits = Number(invRow?.totalReservedUnits ?? 0);
        const outOfStockCount = Number(invRow?.outOfStockCount ?? 0);
        const lowStockCount = Number(invRow?.lowStockCount ?? 0);
        const inStockCount = Number(invRow?.inStockCount ?? 0);

        // Process Payment Attempts
        let totalPaymentAttempts = 0;
        let successfulPayments = 0;
        let failedPayments = 0;
        const gatewayBreakdown: Record<string, number> = {};

        if (Array.isArray(paymentAttemptRows)) {
            for (const row of paymentAttemptRows) {
                const count = Number(row.count ?? 0);
                totalPaymentAttempts += count;
                const provider = row.provider ?? "UNKNOWN";
                gatewayBreakdown[provider] = (gatewayBreakdown[provider] || 0) + count;
                if (row.status === "SUCCESS") successfulPayments += count;
                if (row.status === "FAILED") failedPayments += count;
            }
        }

        const paymentFailureRate =
            totalPaymentAttempts > 0
                ? Number(((failedPayments / totalPaymentAttempts) * 100).toFixed(1))
                : 0;

        // Process Reviews
        let totalReviews = 0;
        let pendingReviews = 0;
        let approvedReviews = 0;
        let rejectedReviews = 0;

        if (Array.isArray(reviewGroups)) {
            for (const g of reviewGroups) {
                const count = g._count?.id ?? 0;
                totalReviews += count;
                if (g.status === "PENDING") pendingReviews = count;
                else if (g.status === "APPROVED") approvedReviews = count;
                else if (g.status === "REJECTED") rejectedReviews = count;
            }
        }

        const result = {
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
                totalTrackedVariants,
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
                averagePlatformRating: Number((ratingAgg?._avg?.rating ?? 0).toFixed(1)),
            },
            promotions: {
                activeCouponsCount,
            },
        };

        await cacheService.set(cacheKey, result, CACHE_TTL.ONE_MINUTE);

        return result;
    }

    getSalesAndRevenueChart(query: SalesTrendQueryInput) {
        return dashboardAnalyticsService.getSalesAndRevenueChart(query);
    }

    getTopSellingProducts(query: TopSellersQueryInput) {
        return dashboardAnalyticsService.getTopSellingProducts(query);
    }

    getLowStockAlerts(query: LowStockAlertsQueryInput) {
        return dashboardOperationsService.getLowStockAlerts(query);
    }

    getRecentFailedPayments(query: FailedPaymentsQueryInput) {
        return dashboardOperationsService.getRecentFailedPayments(query);
    }

    getOperationalHealth() {
        return dashboardOperationsService.getOperationalHealth();
    }
}

export const dashboardService = new DashboardService();
