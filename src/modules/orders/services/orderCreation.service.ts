import { prisma } from "@/lib/prisma.js";
import { orderNumberService } from "./orderNumber.service.js";
import { orderValidationService } from "./orderValidation.service.js";
import { orderCouponService } from "./orderCoupon.service.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { idempotencyService } from "./idempotency.service.js";
import type { CheckoutInput } from "../validations/order.validation.js";

export class OrderCreationService {
    /**
     * Previews checkout breakdown and validation without modifying the database or reserving stock.
     */
    async validateCheckout(userId?: string, input?: CheckoutInput, sessionId?: string) {
        const { items, subtotal } = await orderValidationService.validateCartAndItems(
            userId,
            input?.cartId,
            sessionId,
        );

        const { shippingAddress, billingAddress } = await orderValidationService.resolveAddresses(
            userId,
            input?.shippingAddressId,
            input?.shippingAddress,
            input?.billingAddressId,
            input?.billingAddress,
        );

        const { coupon, discountAmount, isFreeShipping } = await orderCouponService.validateAndCalculateDiscount(
            input?.couponCode,
            subtotal,
            userId,
        );

        const { shippingTotal, taxTotal } = orderValidationService.calculateFees(subtotal, isFreeShipping);
        const grandTotal = Number((subtotal - discountAmount + shippingTotal + taxTotal).toFixed(2));

        return {
            isValid: true,
            summary: {
                itemCount: items.length,
                totalUnits: items.reduce((acc, i) => acc + i.quantity, 0),
                subtotal,
                discountTotal: discountAmount,
                shippingTotal,
                taxTotal,
                grandTotal: Math.max(0, grandTotal),
                currency: input?.currency || "USD",
            },
            coupon: coupon ? { code: coupon.code, type: coupon.type, discountAmount } : null,
            shippingAddress,
            billingAddress,
            items,
        };
    }

    /**
     * Transactionally creates an order, snapshots items and address, reserves stock, applies coupons, and clears cart.
     */
    async createOrder(
        userId?: string,
        input?: CheckoutInput,
        idempotencyKey?: string,
        sessionId?: string,
    ) {
        // 1. Idempotency Check & Lock
        const idempotency = await idempotencyService.resolveOrLockKey(idempotencyKey, userId);
        if (idempotency.isCached) {
            return idempotency.responseBody;
        }

        try {
            // 2. Validate Cart & Items
            const { cartId, items, subtotal } = await orderValidationService.validateCartAndItems(
                userId,
                input?.cartId,
                sessionId,
            );

            // 3. Resolve & Validate Addresses
            const { shippingAddress } = await orderValidationService.resolveAddresses(
                userId,
                input?.shippingAddressId,
                input?.shippingAddress,
                input?.billingAddressId,
                input?.billingAddress,
            );

            // 4. Validate & Calculate Coupon Discount
            const { coupon, discountAmount, isFreeShipping } = await orderCouponService.validateAndCalculateDiscount(
                input?.couponCode,
                subtotal,
                userId,
            );

            // 5. Calculate Shipping, Taxes, and Grand Total
            const { shippingTotal, taxTotal } = orderValidationService.calculateFees(subtotal, isFreeShipping);
            const grandTotal = Number((subtotal - discountAmount + shippingTotal + taxTotal).toFixed(2));
            const orderNumber = orderNumberService.generateOrderNumber();

            // 6. Execute atomic database transaction
            const order = await prisma.$transaction(async (tx) => {
                // A. Create Order entity
                const createdOrder = await tx.order.create({
                    data: {
                        orderNumber,
                        userId: userId ?? null,
                        status: "PENDING",
                        currency: input?.currency || "USD",
                        subtotal,
                        discountTotal: discountAmount,
                        taxTotal,
                        shippingTotal,
                        grandTotal: Math.max(0, grandTotal),
                        notes: input?.notes ?? null,
                    },
                });

                // B. Create immutable OrderItem snapshots
                for (const item of items) {
                    await tx.orderItem.create({
                        data: {
                            orderId: createdOrder.id,
                            productId: item.productId,
                            variantId: item.variantId,
                            productName: item.productName,
                            sku: item.sku,
                            variantSnapshot: item.variantSnapshot,
                            unitPrice: item.unitPrice,
                            quantity: item.quantity,
                            discountTotal: 0,
                            taxTotal: 0,
                            total: item.lineTotal,
                        },
                    });
                }

                // C. Create immutable OrderAddress snapshot
                await tx.orderAddress.create({
                    data: {
                        orderId: createdOrder.id,
                        recipientName: shippingAddress.recipientName,
                        phone: shippingAddress.phone ?? null,
                        addressLine1: shippingAddress.addressLine1,
                        addressLine2: shippingAddress.addressLine2 ?? null,
                        city: shippingAddress.city,
                        state: shippingAddress.state,
                        postalCode: shippingAddress.postalCode,
                        country: shippingAddress.country,
                        latitude: shippingAddress.latitude ?? null,
                        longitude: shippingAddress.longitude ?? null,
                    },
                });

                // D. Record initial OrderStatusHistory entry
                await tx.orderStatusHistory.create({
                    data: {
                        orderId: createdOrder.id,
                        previousStatus: null,
                        newStatus: "PENDING",
                        changedBy: userId ?? null,
                        reason: "Order placed by customer during checkout",
                    },
                });

                // E. Atomically reserve inventory units
                await orderInventoryService.reserveItemsForOrder(
                    tx,
                    createdOrder.id,
                    items.map((i) => ({
                        variantId: i.variantId,
                        productName: i.productName,
                        sku: i.sku,
                        quantity: i.quantity,
                    })),
                );

                // F. Record coupon usage if coupon applied
                if (coupon) {
                    await orderCouponService.recordUsage(
                        tx,
                        coupon.id,
                        createdOrder.id,
                        discountAmount,
                        userId,
                    );
                }

                // G. Clear shopping cart
                await tx.cartItem.deleteMany({
                    where: { cartId },
                });

                return createdOrder;
            });

            // 7. Load populated order response
            const fullOrder = await prisma.order.findUnique({
                where: { id: order.id },
                include: {
                    items: true,
                    address: true,
                    statusHistory: { orderBy: { createdAt: "desc" } },
                    couponUsages: {
                        include: { coupon: { select: { code: true, type: true } } },
                    },
                    reservations: { select: { id: true, status: true, expiresAt: true } },
                },
            });

            const formattedResponse = this.formatOrderResponse(fullOrder);

            // 8. Finalize Idempotency Key
            if (idempotencyKey) {
                await idempotencyService.finalizeKey(idempotencyKey, 201, formattedResponse);
            }

            return formattedResponse;
        } catch (error) {
            // Release idempotency lock on failure so client can retry
            if (idempotencyKey) {
                await idempotencyService.releaseKey(idempotencyKey);
            }
            throw error;
        }
    }

    /**
     * Formats complete order details for API responses.
     */
    formatOrderResponse(order: any) {
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            userId: order.userId,
            status: order.status,
            financials: {
                currency: order.currency,
                subtotal: Number(order.subtotal),
                discountTotal: Number(order.discountTotal),
                taxTotal: Number(order.taxTotal),
                shippingTotal: Number(order.shippingTotal),
                grandTotal: Number(order.grandTotal),
            },
            notes: order.notes,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            shippingAddress: order.address
                ? {
                    recipientName: order.address.recipientName,
                    phone: order.address.phone,
                    addressLine1: order.address.addressLine1,
                    addressLine2: order.address.addressLine2,
                    city: order.address.city,
                    state: order.address.state,
                    postalCode: order.address.postalCode,
                    country: order.address.country,
                }
                : null,
            items: (order.items || []).map((item: any) => ({
                id: item.id,
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                sku: item.sku,
                unitPrice: Number(item.unitPrice),
                quantity: item.quantity,
                discountTotal: Number(item.discountTotal),
                taxTotal: Number(item.taxTotal),
                total: Number(item.total),
                variantSnapshot: item.variantSnapshot,
            })),
            coupon: order.couponUsages?.[0]
                ? {
                    code: order.couponUsages[0].coupon.code,
                    type: order.couponUsages[0].coupon.type,
                    discountAmount: Number(order.couponUsages[0].discountAmount),
                }
                : null,
            statusHistory: (order.statusHistory || []).map((sh: any) => ({
                id: sh.id,
                previousStatus: sh.previousStatus,
                newStatus: sh.newStatus,
                reason: sh.reason,
                changedBy: sh.changedBy,
                createdAt: sh.createdAt,
            })),
            reservations: order.reservations ?? [],
        };
    }
}

export const orderCreationService = new OrderCreationService();
