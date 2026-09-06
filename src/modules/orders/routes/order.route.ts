import type { FastifyInstance } from "fastify";
import { orderController } from "../controller/order.controller.js";
import { orderSwaggerSchemas } from "@/common/docs/orderDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Order & Checkout routes under /api/orders.
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
                tags: ["Orders & Checkout"],
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
                tags: ["Orders & Checkout"],
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
                tags: ["Orders & Checkout"],
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
                tags: ["Orders & Checkout"],
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
                tags: ["Orders & Checkout"],
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
                tags: ["Orders & Checkout"],
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
    // Admin Order Management
    // ----------------------------------------------------
    app.get(
        "/admin",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_READ),
            ],
            schema: {
                tags: ["Orders & Checkout"],
                summary: "[Admin: order:read] List all customer orders",
                description: "Admin search and management list across all orders in the system with customer details and pagination.",
                security: [{ bearerAuth: [] }],
                querystring: orderSwaggerSchemas.orderQuery,
            },
        },
        orderController.listAllOrders.bind(orderController),
    );

    app.patch(
        "/:id/status",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.ORDER_UPDATE),
            ],
            schema: {
                tags: ["Orders & Checkout"],
                summary: "[Admin: order:update] Update order status",
                description: "Updates an order's lifecycle status (e.g. CONFIRMED, PROCESSING, SHIPPED, DELIVERED) and records the transition in OrderStatusHistory.",
                security: [{ bearerAuth: [] }],
                params: orderSwaggerSchemas.orderIdParam,
                body: orderSwaggerSchemas.updateStatus,
            },
        },
        orderController.updateOrderStatus.bind(orderController),
    );
}
