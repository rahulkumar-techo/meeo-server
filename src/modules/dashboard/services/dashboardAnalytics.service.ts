import { prisma } from "@/lib/prisma.js";
import type {
    SalesTrendQueryInput,
    TopSellersQueryInput,
} from "../validations/dashboard.validation.js";

export class DashboardAnalyticsService {
    resolveDateRange(period?: string, startDate?: string, endDate?: string): { gte?: Date; lte?: Date } {
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

        return {};
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
                const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
                const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
            } else {
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
}

export const dashboardAnalyticsService = new DashboardAnalyticsService();
