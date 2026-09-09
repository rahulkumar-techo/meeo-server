/**
 * Canonical domain & business events emitted across WebSockets.
 * 
 * IMPORTANT ARCHITECTURAL PRINCIPLE:
 * We do not emit raw database changes (e.g. ROW_UPDATED).
 * We emit semantic business domain events that UI clients and admin consoles can react to.
 */

export const SOCKET_EVENTS = {
    // Order Lifecycle Events
    ORDER_CREATED: "order.created",
    ORDER_CONFIRMED: "order.confirmed",
    ORDER_PROCESSING: "order.processing",
    ORDER_SHIPPED: "order.shipped",
    ORDER_DELIVERED: "order.delivered",
    ORDER_CANCELLED: "order.cancelled",

    // Payment Lifecycle Events
    PAYMENT_PROCESSING: "payment.processing",
    PAYMENT_SUCCESS: "payment.success",
    PAYMENT_FAILED: "payment.failed",
    PAYMENT_REFUNDED: "payment.refunded",

    // Inventory & Stock Alerts
    INVENTORY_LOW: "inventory.low",
    INVENTORY_RESTOCKED: "inventory.restocked",

    // Customer Notification Events
    NOTIFICATION_CREATED: "notification.created",

    // System / Connection Events
    CONNECT_SUCCESS: "system.connect_success",
    ERROR: "system.error",
} as const;

export type SocketEventType = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

/**
 * Standard envelope structure for all WebSocket events.
 */
export interface SocketEventPayload<T = unknown> {
    event: SocketEventType;
    timestamp: string;
    data: T;
}

/**
 * Order event data shape.
 */
export interface OrderEventData {
    orderId: string;
    orderNumber?: string;
    userId: string;
    status: string;
    totalAmount?: number;
    trackingNumber?: string;
    updatedAt: string;
}

/**
 * Payment event data shape.
 */
export interface PaymentEventData {
    paymentId: string;
    orderId: string;
    userId: string;
    status: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
    updatedAt: string;
}

/**
 * Inventory stock alert shape.
 */
export interface InventoryEventData {
    productId: string;
    variantId?: string;
    sku?: string;
    productName?: string;
    currentStock: number;
    lowStockThreshold: number;
    updatedAt: string;
}

/**
 * Customer in-app notification shape.
 */
export interface NotificationEventData {
    notificationId: string;
    userId: string;
    title: string;
    message: string;
    type: string;
    createdAt: string;
}

/**
 * Helper to build a standard event payload envelope.
 */
export function createSocketPayload<T>(event: SocketEventType, data: T): SocketEventPayload<T> {
    return {
        event,
        timestamp: new Date().toISOString(),
        data,
    };
}
