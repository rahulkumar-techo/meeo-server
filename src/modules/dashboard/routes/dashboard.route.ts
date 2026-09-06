import type { FastifyInstance } from "fastify";
import { dashboardController } from "../controller/dashboard.controller.js";
import { dashboardSwaggerSchemas } from "@/common/docs/dashboardDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Admin Dashboard routes under /api/v1/admin/dashboard.
 */
export async function dashboardRouter(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);

    app.get(
        "/overview",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Executive overview KPIs",
                description: "Retrieves unified high-level KPI metrics across revenue, orders, user registrations, inventory levels, payment failure rates, review queues, and active coupon promotions.",
                security: [{ bearerAuth: [] }],
                querystring: dashboardSwaggerSchemas.periodQuery,
            },
        },
        dashboardController.getOverview.bind(dashboardController),
    );

    app.get(
        "/sales-chart",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Sales & revenue time-series charts",
                description: "Retrieves aggregated daily, weekly, or monthly revenue and order volumes for rendering time-series charts in admin frontends.",
                security: [{ bearerAuth: [] }],
                querystring: dashboardSwaggerSchemas.salesTrendQuery,
            },
        },
        dashboardController.getSalesChart.bind(dashboardController),
    );

    app.get(
        "/top-sellers",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Top-selling products",
                description: "Ranks best-selling products by units sold and gross revenue generated from completed order items.",
                security: [{ bearerAuth: [] }],
                querystring: dashboardSwaggerSchemas.topSellersQuery,
            },
        },
        dashboardController.getTopSellers.bind(dashboardController),
    );

    app.get(
        "/low-stock",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Low-stock inventory alerts",
                description: "Lists all product variants currently at or below their reorder threshold with current available stock quantities.",
                security: [{ bearerAuth: [] }],
                querystring: dashboardSwaggerSchemas.lowStockQuery,
            },
        },
        dashboardController.getLowStock.bind(dashboardController),
    );

    app.get(
        "/failed-payments",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Recent failed payments log",
                description: "Lists recent failed payment attempts with gateway error reason codes, amounts, customer details, and order references for dispute and failure triage.",
                security: [{ bearerAuth: [] }],
                querystring: dashboardSwaggerSchemas.failedPaymentsQuery,
            },
        },
        dashboardController.getFailedPayments.bind(dashboardController),
    );

    app.get(
        "/health",
        {
            preHandler: [app.requirePermission(PERMISSIONS.DASHBOARD_READ)],
            schema: {
                tags: ["Admin Dashboard & Analytics"],
                summary: "[Admin: dashboard:read] Operational backlog health",
                description: "Real-time telemetry on operational backlogs including pending outbox events, failed events, review moderation queues, and unfulfilled orders.",
                security: [{ bearerAuth: [] }],
            },
        },
        dashboardController.getHealth.bind(dashboardController),
    );
}

export default dashboardRouter;
