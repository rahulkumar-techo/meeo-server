import { z } from "zod";

/**
 * Validation schema for general period-based dashboard analytics.
 */
export const dashboardPeriodQuerySchema = z.object({
    period: z.enum(["today", "7d", "30d", "90d", "1y", "all"]).default("30d"),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

/**
 * Validation schema for time-series sales and revenue charts.
 */
export const salesTrendQuerySchema = z.object({
    period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
    interval: z.enum(["day", "week", "month"]).default("day"),
});

/**
 * Validation schema for low-stock inventory alerts.
 */
export const lowStockAlertsQuerySchema = z.object({
    threshold: z.coerce.number().int().min(0).default(10),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Validation schema for top-selling products.
 */
export const topSellersQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    period: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
});

/**
 * Validation schema for querying failed payment attempts.
 */
export const failedPaymentsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DashboardPeriodQueryInput = z.infer<typeof dashboardPeriodQuerySchema>;
export type SalesTrendQueryInput = z.infer<typeof salesTrendQuerySchema>;
export type LowStockAlertsQueryInput = z.infer<typeof lowStockAlertsQuerySchema>;
export type TopSellersQueryInput = z.infer<typeof topSellersQuerySchema>;
export type FailedPaymentsQueryInput = z.infer<typeof failedPaymentsQuerySchema>;
