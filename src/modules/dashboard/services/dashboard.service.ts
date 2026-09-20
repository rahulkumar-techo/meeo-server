import { prisma } from "@/lib/prisma.js";
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
        const dateFilter = this.resolveDateRange(query.period, query.startDate, query.endDate);
        const orderWhereDate = dateFilter.gte ? { createdAt: dateFilter } : {};
        const paymentWhereDate = dateFilter.gte ? { initiatedAt: dateFilter } : {};
        const refundWhereDate = dateFilter.gte ? { requestedAt: dateFilter } : {};

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
            prisma.refund.aggregate({
                where: {
                    status: "SUCCESS",
                    ...refundWhereDate,
                },
                _sum: { amount: true },
            }),
            Promise.all([
                prisma.user.count(),
                prisma.user.count({ where: { status: "ACTIVE" } }),
                prisma.user.count({ where: { status: "SUSPENDED" } }),
                prisma.user.count({ where: { status: "BLOCKED" } }),
            ]),
            prisma.user.count({
                where: orderWhereDate,
            }),
            prisma.inventory.findMany({
                select: {
                    availableQuantity: true,
                    reservedQuantity: true,
                    reorderLevel: true,
                    variant: { select: { id: true, status: true } },
                },
            }),
            prisma.paymentAttempt.findMany({
                where: paymentWhereDate,
                select: {
                    id: true,
                    status: true,
                    payment: { select: { provider: true } },
                },
            }),
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
            prisma.reviewReport.count({ where: { status: "PENDING" } }),
            prisma.coupon.count({ where: { status: "ACTIVE" } }),
        ]);

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

        const [totalUsers, activeUsers, suspendedUsers, blockedUsers] = userCounts;

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
