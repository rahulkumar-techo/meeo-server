import { orderCreationService } from "./orderCreation.service.js";
import { orderQueryService } from "./orderQuery.service.js";
import { orderStatusService } from "./orderStatus.service.js";
import { orderFulfillmentService } from "./orderFulfillment.service.js";
import { orderValidationService } from "./orderValidation.service.js";
import { orderCouponService } from "./orderCoupon.service.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { orderNumberService } from "./orderNumber.service.js";
import { idempotencyService } from "./idempotency.service.js";
import type {
    CheckoutInput,
    OrderQueryInput,
    OrderStatusUpdateInput,
    ShipOrderInput,
    DeliverOrderInput,
} from "../validations/order.validation.js";

export { orderCreationService } from "./orderCreation.service.js";
export { orderQueryService } from "./orderQuery.service.js";
export { orderStatusService } from "./orderStatus.service.js";
export { orderFulfillmentService } from "./orderFulfillment.service.js";
export { orderValidationService } from "./orderValidation.service.js";
export { orderCouponService } from "./orderCoupon.service.js";
export { orderInventoryService } from "./orderInventory.service.js";
export { orderNumberService } from "./orderNumber.service.js";
export { idempotencyService } from "./idempotency.service.js";

/**
 * Unified OrderService orchestrator facade delegating to modular domain sub-services.
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

    confirmOrder(orderId: string, changedBy?: string, reason?: string) {
        return orderFulfillmentService.confirmOrder(orderId, changedBy, reason);
    }

    processOrder(orderId: string, changedBy?: string, reason?: string) {
        return orderFulfillmentService.processOrder(orderId, changedBy, reason);
    }

    shipOrder(orderId: string, input: ShipOrderInput, changedBy?: string) {
        return orderFulfillmentService.shipOrder(orderId, input, changedBy);
    }

    deliverOrder(orderId: string, input?: DeliverOrderInput, changedBy?: string) {
        return orderFulfillmentService.deliverOrder(orderId, input, changedBy);
    }

    expireStaleOrders(olderThanMinutes?: number, changedBy?: string) {
        return orderFulfillmentService.expireStaleOrders(olderThanMinutes, changedBy);
    }

    getOrderMetrics(startDate?: string, endDate?: string) {
        return orderFulfillmentService.getOrderMetrics(startDate, endDate);
    }
}

export const orderService = new OrderService();
