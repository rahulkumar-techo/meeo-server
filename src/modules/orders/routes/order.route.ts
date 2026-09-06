import type { FastifyInstance } from "fastify";
import { orderController } from "../controller/order.controller.js";
import { orderSwaggerSchemas } from "@/common/docs/orderDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Order & Fulfillment routes under /api/orders.
 */
export default async function orderRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Checkout & Order Creation
    // ----------------------------------------------------
    app.post(
        "/validate-checkout",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Public / User] Preview checkout breakdown",
                description: "Validates cart items, verifies stock availability, checks coupon code eligibility, and calculates shipping, taxes, and grand totals without creating an order.",
                body: orderSwaggerSchemas.checkout,
                headers: {
                    type: "object",
                    properties: {
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        orderController.validateCheckout.bind(orderController),
    );

    app.post(
        "/checkout",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Public / User] Transactional Checkout & Order Creation",
                description: "Atomically creates an order within a database transaction: validates live canonical prices, checks stock, creates inventory reservations, applies coupons, snapshots item and address data, logs status history, and clears the cart. Supports duplicate request deduplication via `Idempotency-Key` header.",
                body: orderSwaggerSchemas.checkout,
                headers: {
                    type: "object",
                    properties: {
                        "idempotency-key": { type: "string", description: "Unique UUID or token to prevent duplicate order placements" },
                        "x-session-id": { type: "string", description: "Optional guest session identifier" },
                    },
                },
            },
        },
        orderController.checkout.bind(orderController),
    );

    // ----------------------------------------------------
    // Authenticated Customer Order Queries
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[User] List customer orders",
                description: "Retrieves a paginated list of orders placed by the authenticated customer with status and date filtering.",
                security: [{ bearerAuth: [] }],
                querystring: orderSwaggerSchemas.orderQuery,
            },
        },
        orderController.listUserOrders.bind(orderController),
    );

    app.get(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[User / Admin] Get order details by ID",
                description: "Retrieves complete order information including item snapshots, delivery address, status history, and payments.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
            },
        },
        orderController.getOrderById.bind(orderController),
    );

    app.get(
        "/number/:orderNumber",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[User / Admin] Get order details by order number",
                description: "Retrieves complete order details using the human-readable order number (e.g. ORD-20260906-AB123).",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderNumberParam,
            },
        },
        orderController.getOrderByNumber.bind(orderController),
    );

    app.post(
        "/:id/cancel",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[User / Admin] Cancel order",
                description: "Cancels an order and automatically releases all active inventory reservation holds back to available stock.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
                body: orderSwaggerSchemas.cancelOrder,
            },
        },
        orderController.cancelOrder.bind(orderController),
    );

    // ----------------------------------------------------
    // Order Fulfillment Operations
    // ----------------------------------------------------
    app.post(
        "/:id/confirm",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Confirm order for fulfillment",
                description: "Explicitly confirms a pending order and commits its inventory reservations to sold stock.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
            },
        },
        orderController.confirmOrder.bind(orderController),
    );

    app.post(
        "/:id/process",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Move order to processing",
                description: "Moves a confirmed order to PROCESSING status for warehouse packaging and picking.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
            },
        },
        orderController.processOrder.bind(orderController),
    );

    app.post(
        "/:id/ship",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Mark order as shipped",
                description: "Updates order status to SHIPPED and attaches carrier logistics details (tracking number, carrier name, tracking URL).",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
                body: orderSwaggerSchemas.shipOrder,
            },
        },
        orderController.shipOrder.bind(orderController),
    );

    app.post(
        "/:id/deliver",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Mark order as delivered",
                description: "Transitions order to DELIVERED status upon courier delivery confirmation.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
                body: orderSwaggerSchemas.deliverOrder,
            },
        },
        orderController.deliverOrder.bind(orderController),
    );

    app.post(
        "/expire-stale",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Sweep and expire stale checkout orders",
                description: "Scans and marks unconfirmed orders as EXPIRED, releasing held stock back to available pool.",
                security: [{ bearerAuth: [] }],
                body: orderSwaggerSchemas.expireOrders,
            },
        },
        orderController.expireStaleOrders.bind(orderController),
    );

    // ----------------------------------------------------
    // Admin Order Management & Metrics
    // ----------------------------------------------------
    app.get(
        "/admin",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_READ),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:read] List all customer orders",
                description: "Admin search and management list across all orders in the system with customer details, date filtering, and pagination.",
                security: [{ bearerAuth: [] }],
                querystring: orderSwaggerSchemas.orderQuery,
            },
        },
        orderController.listAllOrders.bind(orderController),
    );

    app.get(
        "/admin/metrics",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_READ),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:read] Get order and fulfillment analytics",
                description: "Aggregated order counts by status, revenue totals, average order value, and active fulfillment counts.",
                security: [{ bearerAuth: [] }],
                querystring: orderSwaggerSchemas.orderMetricsQuery,
            },
        },
        orderController.getOrderMetrics.bind(orderController),
    );

    app.patch(
        "/:id/status",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Fulfillment"],
                summary: "[Admin: order:update] Update order status",
                description: "Updates an order's lifecycle status (CONFIRMED, PROCESSING, SHIPPED, DELIVERED, CANCELLED) with state machine validation and audit logging.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
                body: orderSwaggerSchemas.updateStatus,
            },
        },
        orderController.updateOrderStatus.bind(orderController),
    );
}
