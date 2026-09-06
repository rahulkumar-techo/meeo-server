import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { orderService } from "../services/order.service.js";
import {
    checkoutSchema,
    orderCancelSchema,
    orderIdParamSchema,
    orderNumberParamSchema,
    orderQuerySchema,
    orderStatusUpdateSchema,
    validateCheckoutSchema,
} from "../validations/order.validation.js";

export class OrderController {
    /**
     * Previews checkout calculations, shipping, taxes, and coupon discounts without creating an order.
     */
    async validateCheckout(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        const sessionId = (request.headers["x-session-id"] as string | undefined) ||
            (request.headers["session-id"] as string | undefined);
        const input = validateCheckoutSchema.parse(request.body || {});

        const result = await orderService.validateCheckout(userId, input, sessionId);

        return sendOk({
            reply,
            message: "Checkout validated successfully",
            data: result,
        });
    }

    /**
     * Executes atomic checkout and creates order with item snapshots and inventory reservations.
     */
    async checkout(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        const sessionId = (request.headers["x-session-id"] as string | undefined) ||
            (request.headers["session-id"] as string | undefined);
        const idempotencyKey = (request.headers["idempotency-key"] as string | undefined) ||
            (request.headers["x-idempotency-key"] as string | undefined);

        const input = checkoutSchema.parse(request.body || {});

        const result = await orderService.createOrder(userId, input, idempotencyKey, sessionId);

        return sendCreated({
            reply,
            message: "Order placed successfully",
            data: result,
        });
    }

    /**
     * Lists orders for the authenticated user.
     */
    async listUserOrders(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user.id;
        const query = orderQuerySchema.parse(request.query);

        const result = await orderService.listUserOrders(userId, query);

        return sendOk({
            reply,
            message: "Orders retrieved successfully",
            data: {
                items: result.items,
                pagination: result.pagination,
            },
        });
    }

    /**
     * Admin endpoint: lists all orders with multi-field search and status filtering.
     */
    async listAllOrders(request: FastifyRequest, reply: FastifyReply) {
        const query = orderQuerySchema.parse(request.query);
        const result = await orderService.listAllOrders(query);

        return sendOk({
            reply,
            message: "All orders retrieved successfully",
            data: {
                items: result.items,
                pagination: result.pagination,
            },
        });
    }

    /**
     * Retrieves an order by ID.
     */
    async getOrderById(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        const { id } = orderIdParamSchema.parse(request.params);
        const isAdmin = request.user?.roles?.includes("SUPER_ADMIN") ||
            request.user?.permissions?.includes("order:read");

        const result = await orderService.getOrderById(id, userId, !!isAdmin);

        return sendOk({
            reply,
            message: "Order retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves an order by human order number.
     */
    async getOrderByNumber(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        const { orderNumber } = orderNumberParamSchema.parse(request.params);
        const isAdmin = request.user?.roles?.includes("SUPER_ADMIN") ||
            request.user?.permissions?.includes("order:read");

        const result = await orderService.getOrderByNumber(orderNumber, userId, !!isAdmin);

        return sendOk({
            reply,
            message: "Order retrieved successfully",
            data: result,
        });
    }

    /**
     * Cancels an order and restores reserved stock.
     */
    async cancelOrder(request: FastifyRequest, reply: FastifyReply) {
        const userId = request.user?.id;
        const { id } = orderIdParamSchema.parse(request.params);
        const input = orderCancelSchema.parse(request.body || {});
        const isAdmin = request.user?.roles?.includes("SUPER_ADMIN") ||
            request.user?.permissions?.includes("order:cancel");

        const result = await orderService.cancelOrder(id, userId, input.reason, !!isAdmin);

        return sendOk({
            reply,
            message: "Order cancelled successfully and inventory holds released",
            data: result,
        });
    }

    /**
     * Admin status update with status history logging.
     */
    async updateOrderStatus(request: FastifyRequest, reply: FastifyReply) {
        const adminId = request.user.id;
        const { id } = orderIdParamSchema.parse(request.params);
        const input = orderStatusUpdateSchema.parse(request.body);

        const result = await orderService.updateOrderStatus(id, input, adminId);

        return sendOk({
            reply,
            message: `Order status updated to ${input.status} successfully`,
            data: result,
        });
    }
}

export const orderController = new OrderController();
