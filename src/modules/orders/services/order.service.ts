import { orderCreationService } from "./orderCreation.service.js";
import { orderQueryService } from "./orderQuery.service.js";
import { orderStatusService } from "./orderStatus.service.js";
import { orderValidationService } from "./orderValidation.service.js";
import { orderCouponService } from "./orderCoupon.service.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { orderNumberService } from "./orderNumber.service.js";
import { idempotencyService } from "./idempotency.service.js";
import type {
    CheckoutInput,
    OrderQueryInput,
    OrderStatusUpdateInput,
} from "../validations/order.validation.js";

export { orderCreationService } from "./orderCreation.service.js";
export { orderQueryService } from "./orderQuery.service.js";
export { orderStatusService } from "./orderStatus.service.js";
export { orderValidationService } from "./orderValidation.service.js";
export { orderCouponService } from "./orderCoupon.service.js";
export { orderInventoryService } from "./orderInventory.service.js";
export { orderNumberService } from "./orderNumber.service.js";
export { idempotencyService } from "./idempotency.service.js";

/**
 * Unified OrderService orchestrator facade delegating to modular domain sub-services:
 * - orderCreationService: transactional order orchestration, snapshots, stock holds
 * - orderQueryService: list customer/admin orders, lookups by ID & orderNumber
 * - orderStatusService: status transitions, cancellations, stock release
 * - orderValidationService: cart validation, canonical prices, address resolution
 * - orderCouponService: coupon validation, discount calculations, usage tracking
 * - orderInventoryService: inventory reservations & stock restorations
 * - orderNumberService: unique human-friendly order numbers
 * - idempotencyService: request deduplication & cached response replay
 */
export class OrderService {
    validateCheckout(userId?: string, input?: CheckoutInput, sessionId?: string) {
        return orderCreationService.validateCheckout(userId, input, sessionId);
    }

    createOrder(
        userId?: string,
        input?: CheckoutInput,
        idempotencyKey?: string,
        sessionId?: string,
    ) {
        return orderCreationService.createOrder(userId, input, idempotencyKey, sessionId);
    }

    listUserOrders(userId: string, query: OrderQueryInput) {
        return orderQueryService.listUserOrders(userId, query);
    }

    listAllOrders(query: OrderQueryInput) {
        return orderQueryService.listAllOrders(query);
    }

    getOrderById(orderId: string, userId?: string, isAdmin = false) {
        return orderQueryService.getOrderById(orderId, userId, isAdmin);
    }

    getOrderByNumber(orderNumber: string, userId?: string, isAdmin = false) {
        return orderQueryService.getOrderByNumber(orderNumber, userId, isAdmin);
    }

    updateOrderStatus(orderId: string, input: OrderStatusUpdateInput, changedBy?: string) {
        return orderStatusService.updateOrderStatus(orderId, input, changedBy);
    }

    cancelOrder(orderId: string, userId?: string, reason?: string, isAdmin = false) {
        return orderStatusService.cancelOrder(orderId, userId, reason, isAdmin);
    }
}

export const orderService = new OrderService();
