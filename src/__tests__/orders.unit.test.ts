import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        order: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
            aggregate: vi.fn(),
        },
        outboxEvent: {
            create: vi.fn(),
        },
        orderItem: {
            create: vi.fn(),
        },
        orderAddress: {
            create: vi.fn(),
        },
        orderStatusHistory: {
            create: vi.fn(),
        },
        coupon: {
            findUnique: vi.fn(),
        },
        couponUsage: {
            create: vi.fn(),
            count: vi.fn(),
        },
        idempotencyKey: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        cart: {
            findFirst: vi.fn(),
        },
        cartItem: {
            deleteMany: vi.fn(),
        },
        address: {
            findUnique: vi.fn(),
        },
        inventory: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        inventoryReservation: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        inventoryTransaction: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: any) => any) => {
            if (typeof callback === "function") {
                return callback(prismaMock);
            }
            return Promise.all(callback as unknown as Promise<unknown>[]);
        }),
    },
}));

vi.mock("@/lib/prisma.js", () => ({
    prisma: prismaMock,
}));

import { OrderNumberService } from "@/modules/orders/services/orderNumber.service.js";
import { IdempotencyService } from "@/modules/orders/services/idempotency.service.js";
import { OrderCouponService } from "@/modules/orders/services/orderCoupon.service.js";
import { OrderValidationService } from "@/modules/orders/services/orderValidation.service.js";
import { OrderInventoryService } from "@/modules/orders/services/orderInventory.service.js";
import { OrderStatusService } from "@/modules/orders/services/orderStatus.service.js";
import { OrderFulfillmentService } from "@/modules/orders/services/orderFulfillment.service.js";
import { OrderCreationService } from "@/modules/orders/services/orderCreation.service.js";
import { AppError } from "@/common/errors/app-error.js";

describe("Order & Checkout Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("OrderNumberService", () => {
        it("generates human-readable unique order number with date prefix", () => {
            const service = new OrderNumberService();
            const orderNumber = service.generateOrderNumber();

            expect(orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{5}$/);
        });
    });

    describe("IdempotencyService", () => {
        let service: IdempotencyService;

        beforeEach(() => {
            service = new IdempotencyService();
        });

        it("returns cached response if key is already COMPLETED", async () => {
            const key = "test-idempotency-key";
            prismaMock.idempotencyKey.findUnique.mockResolvedValue({
                key,
                status: "COMPLETED",
                responseStatus: 201,
                responseBody: { id: "order-123", orderNumber: "ORD-2026-001" },
            });

            const result = await service.resolveOrLockKey(key);

            expect(result.isCached).toBe(true);
            expect(result.responseStatus).toBe(201);
            expect(result.responseBody).toEqual({ id: "order-123", orderNumber: "ORD-2026-001" });
        });

        it("throws 409 Conflict if key is currently in PROCESSING state", async () => {
            const key = "in-flight-key";
            prismaMock.idempotencyKey.findUnique.mockResolvedValue({
                key,
                status: "PROCESSING",
                createdAt: new Date(),
            });

            await expect(service.resolveOrLockKey(key)).rejects.toThrow(AppError);
        });

        it("locks new key in PROCESSING state", async () => {
            const key = "fresh-key";
            prismaMock.idempotencyKey.findUnique.mockResolvedValue(null);
            prismaMock.idempotencyKey.create.mockResolvedValue({ key, status: "PROCESSING" });

            const result = await service.resolveOrLockKey(key, "user-1");

            expect(result.isCached).toBe(false);
            expect(prismaMock.idempotencyKey.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ key, userId: "user-1", status: "PROCESSING" }),
                }),
            );
        });
    });

    describe("OrderCouponService", () => {
        let service: OrderCouponService;

        beforeEach(() => {
            service = new OrderCouponService();
        });

        it("calculates percentage discount with maximum cap", async () => {
            prismaMock.coupon.findUnique.mockResolvedValue({
                id: "c1",
                code: "SAVE20",
                type: "PERCENTAGE",
                value: 20,
                status: "ACTIVE",
                minimumOrderAmount: 50,
                maximumDiscountAmount: 30,
                _count: { usages: 5 },
            });

            const result = await service.validateAndCalculateDiscount("SAVE20", 200);

            // 20% of 200 = 40, capped at 30
            expect(result.discountAmount).toBe(30);
            expect(result.isFreeShipping).toBe(false);
        });

        it("calculates fixed amount discount", async () => {
            prismaMock.coupon.findUnique.mockResolvedValue({
                id: "c2",
                code: "FLAT15",
                type: "FIXED_AMOUNT",
                value: 15,
                status: "ACTIVE",
                minimumOrderAmount: null,
                maximumDiscountAmount: null,
                _count: { usages: 0 },
            });

            const result = await service.validateAndCalculateDiscount("FLAT15", 50);

            expect(result.discountAmount).toBe(15);
        });

        it("identifies free shipping coupon", async () => {
            prismaMock.coupon.findUnique.mockResolvedValue({
                id: "c3",
                code: "FREESHIP",
                type: "FREE_SHIPPING",
                value: 0,
                status: "ACTIVE",
                _count: { usages: 0 },
            });

            const result = await service.validateAndCalculateDiscount("FREESHIP", 40);

            expect(result.isFreeShipping).toBe(true);
            expect(result.discountAmount).toBe(0);
        });

        it("throws AppError if subtotal is below minimum order amount", async () => {
            prismaMock.coupon.findUnique.mockResolvedValue({
                id: "c4",
                code: "MIN100",
                type: "FIXED_AMOUNT",
                value: 20,
                status: "ACTIVE",
                minimumOrderAmount: 100,
                _count: { usages: 0 },
            });

            await expect(service.validateAndCalculateDiscount("MIN100", 80)).rejects.toThrow(
                /requires a minimum order subtotal/,
            );
        });

        it("throws AppError if coupon usage limit is exceeded", async () => {
            prismaMock.coupon.findUnique.mockResolvedValue({
                id: "c5",
                code: "LIMITED",
                type: "FIXED_AMOUNT",
                value: 10,
                status: "ACTIVE",
                usageLimit: 10,
                _count: { usages: 10 },
            });

            await expect(service.validateAndCalculateDiscount("LIMITED", 50)).rejects.toThrow(
                /maximum total usage limit/,
            );
        });
    });

    describe("OrderValidationService", () => {
        let service: OrderValidationService;

        beforeEach(() => {
            service = new OrderValidationService();
        });

        it("calculates line totals, subtotal, and tax accurately", async () => {
            prismaMock.cart.findFirst.mockResolvedValue({
                id: "cart-1",
                items: [
                    {
                        id: "ci-1",
                        quantity: 2,
                        variant: {
                            id: "v1",
                            sku: "SKU-A",
                            price: 50.0,
                            status: "ACTIVE",
                            inventory: { availableQuantity: 10 },
                            product: { id: "p1", name: "Product A", status: "ACTIVE", images: [] },
                        },
                    },
                    {
                        id: "ci-2",
                        quantity: 1,
                        variant: {
                            id: "v2",
                            sku: "SKU-B",
                            price: 30.0,
                            status: "ACTIVE",
                            inventory: { availableQuantity: 5 },
                            product: { id: "p2", name: "Product B", status: "ACTIVE", images: [] },
                        },
                    },
                ],
            });

            const result = await service.validateCartAndItems("user-1");

            // Subtotal = (50*2) + (30*1) = 130
            expect(result.subtotal).toBe(130.0);
            expect(result.items).toHaveLength(2);
            expect(result.items[0]!.lineTotal).toBe(100.0);

            const fees = service.calculateFees(result.subtotal);
            // subtotal >= 100 -> free shipping ($0)
            expect(fees.shippingTotal).toBe(0);
            // 8% tax of 130 = 10.40
            expect(fees.taxTotal).toBe(10.4);
        });

        it("resolves saved address and falls back billing address to shipping", async () => {
            prismaMock.address.findUnique.mockResolvedValue({
                id: "addr-1",
                userId: "user-1",
                recipientName: "John Doe",
                addressLine1: "123 Main St",
                city: "New York",
                state: "NY",
                postalCode: "10001",
                country: "USA",
            });

            const result = await service.resolveAddresses("user-1", "addr-1");

            expect(result.shippingAddress.recipientName).toBe("John Doe");
            expect(result.billingAddress.recipientName).toBe("John Doe");
        });
    });

    describe("OrderInventoryService", () => {
        let service: OrderInventoryService;

        beforeEach(() => {
            service = new OrderInventoryService();
        });

        it("shifts available stock to reserved and creates reservation record", async () => {
            prismaMock.inventory.findUnique.mockResolvedValue({
                variantId: "v1",
                availableQuantity: 10,
                reservedQuantity: 2,
            });
            prismaMock.inventoryReservation.create.mockResolvedValue({ id: "res-1" });

            await service.reserveItemsForOrder(
                prismaMock,
                "order-1",
                [{ variantId: "v1", productName: "Widget", sku: "WID-1", quantity: 3 }],
            );

            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId: "v1" },
                data: {
                    availableQuantity: { decrement: 3 },
                    reservedQuantity: { increment: 3 },
                },
            });
            expect(prismaMock.inventoryReservation.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ orderId: "order-1", variantId: "v1", quantity: 3 }),
                }),
            );
        });

        it("releases active reservations and restores stock upon cancellation", async () => {
            prismaMock.inventoryReservation.findMany.mockResolvedValue([
                { id: "res-1", variantId: "v1", quantity: 3, status: "ACTIVE" },
            ]);

            const releasedCount = await service.releaseOrderReservations(prismaMock, "order-1");

            expect(releasedCount).toBe(1);
            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId: "v1" },
                data: {
                    availableQuantity: { increment: 3 },
                    reservedQuantity: { decrement: 3 },
                },
            });
            expect(prismaMock.inventoryReservation.update).toHaveBeenCalledWith({
                where: { id: "res-1" },
                data: { status: "RELEASED" },
            });
        });
    });

    describe("OrderStatusService", () => {
        let service: OrderStatusService;

        beforeEach(() => {
            service = new OrderStatusService();
        });

        it("records status history transition and releases stock if cancelled", async () => {
            const cancelledOrder = {
                id: "order-1",
                status: "CANCELLED",
                orderNumber: "ORD-1",
                userId: "u1",
                currency: "USD",
                subtotal: 100,
                discountTotal: 0,
                taxTotal: 8,
                shippingTotal: 10,
                grandTotal: 118,
                items: [],
                address: null,
                statusHistory: [],
            };

            prismaMock.order.findUnique
                .mockResolvedValueOnce({ id: "order-1", status: "PENDING", userId: "u1" }) // cancelOrder check
                .mockResolvedValueOnce({ id: "order-1", status: "PENDING", userId: "u1" }) // updateOrderStatus check
                .mockResolvedValueOnce(cancelledOrder);                                     // updateOrderStatus load updated

            prismaMock.inventoryReservation.findMany.mockResolvedValue([]);

            const result = await service.cancelOrder("order-1", "u1", "Changed my mind");

            expect(prismaMock.order.update).toHaveBeenCalledWith({
                where: { id: "order-1" },
                data: { status: "CANCELLED" },
            });
            expect(prismaMock.orderStatusHistory.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ orderId: "order-1", newStatus: "CANCELLED" }),
                }),
            );
            expect(result.status).toBe("CANCELLED");
        });
    });

    describe("OrderCreationService", () => {
        let service: OrderCreationService;

        beforeEach(() => {
            service = new OrderCreationService();
        });

        it("orchestrates full checkout: reserves stock, clears cart, and creates snapshots", async () => {
            const userId = "user-123";

            // Cart with 1 item
            prismaMock.cart.findFirst.mockResolvedValue({
                id: "cart-1",
                items: [
                    {
                        id: "ci-1",
                        quantity: 2,
                        variant: {
                            id: "v1",
                            sku: "LAP-PRO",
                            price: 1000.0,
                            status: "ACTIVE",
                            inventory: { availableQuantity: 5 },
                            product: { id: "p1", name: "Laptop Pro", status: "ACTIVE", images: [] },
                        },
                    },
                ],
            });

            // Address
            const shippingAddress = {
                recipientName: "Alice Smith",
                addressLine1: "456 Tech Ave",
                city: "San Francisco",
                state: "CA",
                postalCode: "94107",
                country: "USA",
            };

            // Inventory
            prismaMock.inventory.findUnique.mockResolvedValue({
                variantId: "v1",
                availableQuantity: 5,
                reservedQuantity: 0,
            });

            // Order creation mock in transaction
            prismaMock.order.create.mockResolvedValue({
                id: "order-new",
                orderNumber: "ORD-20260906-TEST1",
                userId,
                status: "PENDING",
                currency: "USD",
                subtotal: 2000.0,
                discountTotal: 0,
                taxTotal: 160.0,
                shippingTotal: 0,
                grandTotal: 2160.0,
            });

            prismaMock.order.findUnique.mockResolvedValue({
                id: "order-new",
                orderNumber: "ORD-20260906-TEST1",
                userId,
                status: "PENDING",
                currency: "USD",
                subtotal: 2000.0,
                discountTotal: 0,
                taxTotal: 160.0,
                shippingTotal: 0,
                grandTotal: 2160.0,
                items: [
                    {
                        id: "oi-1",
                        productId: "p1",
                        variantId: "v1",
                        productName: "Laptop Pro",
                        sku: "LAP-PRO",
                        unitPrice: 1000.0,
                        quantity: 2,
                        discountTotal: 0,
                        taxTotal: 0,
                        total: 2000.0,
                    },
                ],
                address: shippingAddress,
                statusHistory: [{ previousStatus: null, newStatus: "PENDING", reason: "Order placed" }],
                couponUsages: [],
                reservations: [{ id: "res-1", status: "ACTIVE" }],
            });

            const result = (await service.createOrder(userId, {
                shippingAddress,
                currency: "USD",
            })) as any;

            expect(result.orderNumber).toBe("ORD-20260906-TEST1");
            expect(result.financials.grandTotal).toBe(2160.0);
            expect(result.items).toHaveLength(1);
            expect(prismaMock.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: "cart-1" } });
        });
    });

    // ----------------------------------------------------
    // Order Status & State Machine Tests
    // ----------------------------------------------------
    describe("OrderStatusService State Machine", () => {
        const service = new OrderStatusService();

        it("validates allowed transitions (PENDING -> PAYMENT_PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED)", () => {
            expect(() => service.validateStatusTransition("PENDING", "PAYMENT_PENDING")).not.toThrow();
            expect(() => service.validateStatusTransition("PAYMENT_PENDING", "CONFIRMED")).not.toThrow();
            expect(() => service.validateStatusTransition("CONFIRMED", "PROCESSING")).not.toThrow();
            expect(() => service.validateStatusTransition("PROCESSING", "SHIPPED")).not.toThrow();
            expect(() => service.validateStatusTransition("SHIPPED", "DELIVERED")).not.toThrow();
        });

        it("rejects invalid state transitions (e.g. PENDING -> DELIVERED, CANCELLED -> PROCESSING)", () => {
            expect(() => service.validateStatusTransition("PENDING", "DELIVERED")).toThrow(
                /Invalid order status transition from "PENDING" to "DELIVERED"/,
            );
            expect(() => service.validateStatusTransition("CANCELLED", "PROCESSING")).toThrow(
                /Invalid order status transition from "CANCELLED" to "PROCESSING"/,
            );
            expect(() => service.validateStatusTransition("DELIVERED", "PROCESSING")).toThrow(
                /Invalid order status transition from "DELIVERED" to "PROCESSING"/,
            );
        });

        it("updates order status and emits outbox domain event", async () => {
            prismaMock.order.findUnique.mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "CONFIRMED",
            }).mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "PROCESSING",
                subtotal: 100,
                discountTotal: 0,
                taxTotal: 0,
                shippingTotal: 0,
                grandTotal: 100,
                currency: "USD",
                items: [],
                statusHistory: [],
                couponUsages: [],
                reservations: [],
            });

            const result = await service.updateOrderStatus("ord-1", {
                status: "PROCESSING",
                reason: "Warehouse picking begun",
            }, "admin-1");

            expect(result.status).toBe("PROCESSING");
            expect(prismaMock.order.update).toHaveBeenCalledWith({
                where: { id: "ord-1" },
                data: { status: "PROCESSING" },
            });
            expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        eventType: "ORDER_PROCESSING",
                        aggregateType: "Order",
                    }),
                }),
            );
        });
    });

    // ----------------------------------------------------
    // Order Fulfillment Operations Tests
    // ----------------------------------------------------
    describe("OrderFulfillmentService", () => {
        const service = new OrderFulfillmentService();

        it("confirms order and commits active inventory reservations", async () => {
            prismaMock.order.findUnique
                .mockResolvedValueOnce({
                    id: "ord-1",
                    orderNumber: "ORD-001",
                    status: "PAYMENT_PENDING",
                })
                .mockResolvedValueOnce({
                    id: "ord-1",
                    orderNumber: "ORD-001",
                    status: "PAYMENT_PENDING",
                })
                .mockResolvedValueOnce({
                    id: "ord-1",
                    orderNumber: "ORD-001",
                    status: "CONFIRMED",
                    subtotal: 100,
                    discountTotal: 0,
                    taxTotal: 0,
                    shippingTotal: 0,
                    grandTotal: 100,
                    currency: "USD",
                    items: [],
                    statusHistory: [],
                    couponUsages: [],
                    reservations: [],
                });

            prismaMock.inventoryReservation.findMany.mockResolvedValue([
                { id: "res-1", variantId: "var-1", quantity: 2, status: "ACTIVE" },
            ]);

            const result = await service.confirmOrder("ord-1", "admin-1");

            expect(result.status).toBe("CONFIRMED");
            expect(prismaMock.inventory.update).toHaveBeenCalledWith({
                where: { variantId: "var-1" },
                data: { reservedQuantity: { decrement: 2 } },
            });
            expect(prismaMock.inventoryReservation.update).toHaveBeenCalledWith({
                where: { id: "res-1" },
                data: { status: "CONFIRMED" },
            });
        });

        it("ships order and attaches carrier tracking details", async () => {
            prismaMock.order.findUnique.mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "PROCESSING",
            }).mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "SHIPPED",
                subtotal: 100,
                discountTotal: 0,
                taxTotal: 0,
                shippingTotal: 0,
                grandTotal: 100,
                currency: "USD",
                items: [],
                statusHistory: [],
                couponUsages: [],
                reservations: [],
            });

            const result = await service.shipOrder("ord-1", {
                carrier: "FedEx",
                trackingNumber: "FDX123456789",
                trackingUrl: "https://fedex.com/track/FDX123456789",
            }, "admin-1");

            expect(result.status).toBe("SHIPPED");
            expect(result.shipment.carrier).toBe("FedEx");
            expect(result.shipment.trackingNumber).toBe("FDX123456789");
        });

        it("delivers order upon courier delivery confirmation", async () => {
            prismaMock.order.findUnique.mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "SHIPPED",
            }).mockResolvedValueOnce({
                id: "ord-1",
                orderNumber: "ORD-001",
                status: "DELIVERED",
                subtotal: 100,
                discountTotal: 0,
                taxTotal: 0,
                shippingTotal: 0,
                grandTotal: 100,
                currency: "USD",
                items: [],
                statusHistory: [],
                couponUsages: [],
                reservations: [],
            });

            const result = await service.deliverOrder("ord-1", {
                receivedBy: "John Doe",
                deliveryNotes: "Left at front door",
            }, "admin-1");

            expect(result.status).toBe("DELIVERED");
        });

        it("sweeps and expires stale unconfirmed orders", async () => {
            prismaMock.order.findMany.mockResolvedValue([
                { id: "ord-stale-1", orderNumber: "ORD-STALE-1", status: "PENDING" },
                { id: "ord-stale-2", orderNumber: "ORD-STALE-2", status: "PAYMENT_PENDING" },
            ]);

            prismaMock.order.findUnique.mockResolvedValue({
                id: "ord-stale-1",
                orderNumber: "ORD-STALE-1",
                status: "PENDING",
            });

            prismaMock.inventoryReservation.findMany.mockResolvedValue([]);

            const result = await service.expireStaleOrders(30);

            expect(result.scannedCount).toBe(2);
            expect(result.expiredCount).toBe(2);
            expect(result.expiredOrderNumbers).toContain("ORD-STALE-1");
        });

        it("aggregates dashboard metrics across orders", async () => {
            prismaMock.order.groupBy.mockResolvedValue([
                { status: "CONFIRMED", _count: { id: 5 } },
                { status: "DELIVERED", _count: { id: 10 } },
                { status: "CANCELLED", _count: { id: 2 } },
            ]);

            prismaMock.order.aggregate.mockResolvedValue({
                _sum: { grandTotal: 1500.0 },
                _avg: { grandTotal: 100.0 },
                _count: { id: 15 },
            });

            const metrics = await service.getOrderMetrics();

            expect(metrics.totalOrders).toBe(17);
            expect(metrics.fulfilledOrders).toBe(10);
            expect(metrics.activeFulfillmentCount).toBe(5);
            expect(metrics.financials.totalRevenue).toBe(1500.0);
            expect(metrics.financials.averageOrderValue).toBe(100.0);
        });
    });
});
