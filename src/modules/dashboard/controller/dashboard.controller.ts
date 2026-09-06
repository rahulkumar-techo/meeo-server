import type { FastifyRequest, FastifyReply } from "fastify";
import { dashboardService } from "../services/dashboard.service.js";
import {
    dashboardPeriodQuerySchema,
    salesTrendQuerySchema,
    lowStockAlertsQuerySchema,
    topSellersQuerySchema,
    failedPaymentsQuerySchema,
} from "../validations/dashboard.validation.js";

export class DashboardController {
    /**
     * Executive Overview: High-level KPI metrics across revenue, orders, users, inventory, payments, and reviews.
     */
    async getOverview(req: FastifyRequest, reply: FastifyReply) {
        const query = dashboardPeriodQuerySchema.parse(req.query);
        const result = await dashboardService.getExecutiveOverview(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Sales & Revenue Charts: Time-series aggregated daily/weekly/monthly revenue and order volume.
     */
    async getSalesChart(req: FastifyRequest, reply: FastifyReply) {
        const query = salesTrendQuerySchema.parse(req.query);
        const result = await dashboardService.getSalesAndRevenueChart(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Top-selling products ranked by units sold and revenue.
     */
    async getTopSellers(req: FastifyRequest, reply: FastifyReply) {
        const query = topSellersQuerySchema.parse(req.query);
        const result = await dashboardService.getTopSellingProducts(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Low-stock inventory alert list with reorder thresholds.
     */
    async getLowStock(req: FastifyRequest, reply: FastifyReply) {
        const query = lowStockAlertsQuerySchema.parse(req.query);
        const result = await dashboardService.getLowStockAlerts(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Failed payment attempts audit log with gateway reason codes.
     */
    async getFailedPayments(req: FastifyRequest, reply: FastifyReply) {
        const query = failedPaymentsQuerySchema.parse(req.query);
        const result = await dashboardService.getRecentFailedPayments(query);

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Real-time operational health check (backlogs, queues, unfulfilled orders).
     */
    async getHealth(_req: FastifyRequest, reply: FastifyReply) {
        const result = await dashboardService.getOperationalHealth();

        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }
}

export const dashboardController = new DashboardController();
