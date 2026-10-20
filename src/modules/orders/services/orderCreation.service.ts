import { prisma } from "@/lib/prisma.js";
import { orderNumberService } from "./orderNumber.service.js";
import { orderValidationService, DEFAULT_STANDARD_SHIPPING_FEE } from "./orderValidation.service.js";
import { orderCouponService } from "./orderCoupon.service.js";
import { orderInventoryService } from "./orderInventory.service.js";
import { idempotencyService } from "./idempotency.service.js";
import { promotionService } from "@/modules/promotions/services/promotion.service.js";
import { promotionUsageService } from "@/modules/promotions/services/promotionUsage.service.js";
import { AppError } from "@/common/errors/app-error.js";
import { taxRuleService } from "@/modules/tax/services/taxRule.service.js";
import { gstEngineService } from "@/modules/tax/services/gstEngine.service.js";
import { sellerTaxService } from "@/modules/tax/services/sellerTax.service.js";
import { settingService } from "@/modules/settings/services/setting.service.js";
import type { CheckoutInput } from "../validations/order.validation.js";

export class OrderCreationService {
    /**
     * Previews checkout breakdown and validation without modifying the database or reserving stock.
     */
    async validateCheckout(userId: string, input?: CheckoutInput) {
        const { items, subtotal } = await orderValidationService.validateCartAndItems(
            userId,
            input?.cartId,
        );

        const { shippingAddress, billingAddress } = await orderValidationService.resolveAddresses(
            userId,
            input?.shippingAddressId,
            input?.shippingAddress,
            input?.billingAddressId,
            input?.billingAddress,
        );

        // 1. Coupon calculation
        const { coupon, discountAmount: couponDiscount, isFreeShipping: couponFreeShipping } =
            await orderCouponService.validateAndCalculateDiscount(input?.couponCode, subtotal, userId);

        // 2. Promotion evaluation (automatic + promoCode)
        const promoResult = await promotionService.previewCart(
            {
                promoCode: input?.promoCode,
                shippingFee: 0,
                items: items.map((i) => ({
                    productId: i.productId,
                    variantId: i.variantId,
                    productName: i.productName,
                    unitPrice: i.unitPrice,
                    quantity: i.quantity,
                })),
            },
            userId,
        );

        const totalDiscount = Number(Math.min(subtotal, couponDiscount + promoResult.discountSubtotal).toFixed(2));
        const isFreeShipping = couponFreeShipping || promoResult.isFreeShipping;

        // 3. Resolve Seller Tax Profile & Calculate Statutory GST Breakdown
        const defaultSeller = await sellerTaxService.getDefaultSellerProfile();
        const settings = settingService.getSettingsSync();
        const standardShippingFee = settings?.standardShippingFee ?? DEFAULT_STANDARD_SHIPPING_FEE;
        const shippingRule = await taxRuleService.resolveApplicableRule("9968");
        const shippingGstRate = shippingRule ? Number(shippingRule.igstRate) : undefined;

        const gstResult = gstEngineService.calculateOrderGst({
            sellerState: defaultSeller.stateCode,
            customerState: shippingAddress.state,
            items: items.map((i) => {
                if (!i.hsnCode) {
                    throw new AppError(`Product "${i.productName || i.productId}" is missing an HSN code`, 422);
                }
                if (i.taxRate === undefined || i.taxRate === null) {
                    throw new AppError(`Product "${i.productName || i.productId}" has no applicable tax rate`, 422);
                }
                return {
                    id: i.cartItemId,
                    productId: i.productId,
                    productName: i.productName,
                    sku: i.sku,
                    hsnCode: i.hsnCode,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    taxRate: i.taxRate,
                    cgstRate: i.cgstRate,
                    sgstRate: i.sgstRate,
                    igstRate: i.igstRate,
                    cessRate: i.cessRate,
                    taxTreatment: i.taxTreatment,
                    gstRuleId: i.gstRuleId,
                };
            }),
            totalDiscount,
            shippingFee: standardShippingFee,
            isFreeShipping,
            ...(shippingGstRate !== undefined && { shippingGstRate }),
        });

        const shippingTotal = gstResult.totals.shippingTotal;
        const taxTotal = gstResult.totals.totalTaxAmount;
        const grandTotal = gstResult.totals.grandTotal;

        return {
            isValid: true,
            summary: {
                itemCount: items.length,
                totalUnits: items.reduce((acc, i) => acc + i.quantity, 0),
                subtotal,
                discountTotal: totalDiscount,
                shippingTotal,
                taxTotal,
                grandTotal: Math.max(0, grandTotal),
                currency: input?.currency || "INR",
                taxBreakdown: {
                    sellerGstin: defaultSeller.gstin,
                    sellerTradeName: defaultSeller.tradeName,
                    customerGstin: input?.customerGstin ?? null,
                    placeOfSupply: gstResult.placeOfSupply,
                    totalTaxableAmount: gstResult.totals.totalTaxableAmount,
                    cgstTotal: gstResult.totals.totalCgstAmount,
                    sgstTotal: gstResult.totals.totalSgstAmount,
                    igstTotal: gstResult.totals.totalIgstAmount,
                    cessTotal: gstResult.totals.totalCessAmount,
                    totalTax: gstResult.totals.totalTaxAmount,
                    shippingTax: gstResult.shipping.totalTaxAmount,
                },
            },
            coupon: coupon ? { code: coupon.code, type: coupon.type, discountAmount: couponDiscount } : null,
            promotions: promoResult.appliedPromotions,
            shippingAddress,
            billingAddress,
            items,
        };
    }

    /**
     * Transactionally creates an order, snapshots items and address, reserves stock, applies coupons, and clears cart.
     */
    async createOrder(
        userId: string,
        input?: CheckoutInput,
        idempotencyKey?: string,
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
            );

            // 3. Resolve & Validate Addresses
            const { shippingAddress } = await orderValidationService.resolveAddresses(
                userId,
                input?.shippingAddressId,
                input?.shippingAddress,
                input?.billingAddressId,
                input?.billingAddress,
            );

            // 4. Validate & Calculate Coupon and Promotion Discounts
            const { coupon, discountAmount: couponDiscount, isFreeShipping: couponFreeShipping } =
                await orderCouponService.validateAndCalculateDiscount(input?.couponCode, subtotal, userId);

            const promoResult = await promotionService.previewCart(
                {
                    promoCode: input?.promoCode,
                    shippingFee: 0,
                    items: items.map((i) => ({
                        productId: i.productId,
                        variantId: i.variantId,
                        productName: i.productName,
                        unitPrice: i.unitPrice,
                        quantity: i.quantity,
                    })),
                },
                userId,
            );

            const totalDiscount = Number(Math.min(subtotal, couponDiscount + promoResult.discountSubtotal).toFixed(2));
            const isFreeShipping = couponFreeShipping || promoResult.isFreeShipping;

            // 5. Resolve Seller Profile & Calculate GST Breakdown
            const defaultSeller = await sellerTaxService.getDefaultSellerProfile();
            const settings = settingService.getSettingsSync();
            const standardShippingFee = settings?.standardShippingFee ?? DEFAULT_STANDARD_SHIPPING_FEE;

            const shippingRule = await taxRuleService.resolveApplicableRule("9968");
            const shippingGstRate = shippingRule ? Number(shippingRule.igstRate) : undefined;

            const gstResult = gstEngineService.calculateOrderGst({
                sellerState: defaultSeller.stateCode,
                customerState: shippingAddress.state,
                items: items.map((i) => {
                    if (!i.hsnCode) {
                        throw new AppError(`Product "${i.productName || i.productId}" is missing an HSN code`, 422);
                    }
                    if (i.taxRate === undefined || i.taxRate === null) {
                        throw new AppError(`Product "${i.productName || i.productId}" has no applicable tax rate`, 422);
                    }
                    return {
                        id: i.cartItemId,
                        productId: i.productId,
                        productName: i.productName,
                        sku: i.sku,
                        hsnCode: i.hsnCode,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        taxRate: i.taxRate,
                        cgstRate: i.cgstRate,
                        sgstRate: i.sgstRate,
                        igstRate: i.igstRate,
                        cessRate: i.cessRate,
                        taxTreatment: i.taxTreatment,
                        gstRuleId: i.gstRuleId,
                    };
                }),
                totalDiscount,
                shippingFee: standardShippingFee,
                isFreeShipping,
                ...(shippingGstRate !== undefined && { shippingGstRate }),
            });

            const shippingTotal = gstResult.totals.shippingTotal;
            const taxTotal = gstResult.totals.totalTaxAmount;
            const grandTotal = gstResult.totals.grandTotal;
            const orderNumber = orderNumberService.generateOrderNumber();

            // mark cod as confirmed and online as pending after payment via online mark as confirmed
            const isCod = input?.paymentMethod === "COD";
            const initialStatus = isCod ? "CONFIRMED" : "PENDING";

            // 6. Execute atomic database transaction
            const order = await prisma.$transaction(async (tx) => {
                // A. Create Order entity
                const createdOrder = await tx.order.create({
                    data: {
                        orderNumber,
                        userId: userId ?? null,
                        cartId: cartId ?? null,
                        status: initialStatus,
                        currency: input?.currency || "INR",
                        subtotal,
                        discountTotal: totalDiscount,
                        taxTotal,
                        shippingTotal,
                        grandTotal: Math.max(0, grandTotal),
                        notes: input?.notes ?? null,
                    },
                });

                // B. Create immutable OrderItem snapshots and OrderItemTaxSnapshots
                for (const item of items) {
                    const gstItem = gstResult.items.find((gi) => gi.id === item.cartItemId);
                    const allocatedDiscount = gstItem ? gstItem.allocatedDiscount : 0;
                    const itemTax = gstItem ? gstItem.totalTaxAmount : (item.taxTotal ?? 0);
                    const itemTotal = gstItem ? gstItem.finalLineTotal : item.lineTotal;

                    const createdOrderItem = await tx.orderItem.create({
                        data: {
                            orderId: createdOrder.id,
                            productId: item.productId,
                            variantId: item.variantId,
                            productName: item.productName,
                            sku: item.sku,
                            variantSnapshot: item.variantSnapshot,
                            unitPrice: item.unitPrice,
                            quantity: item.quantity,
                            discountTotal: allocatedDiscount,
                            taxTotal: itemTax,
                            total: itemTotal,
                        },
                    });

                    if (gstItem && tx.orderItemTaxSnapshot?.create) {
                        await tx.orderItemTaxSnapshot.create({
                            data: {
                                orderItemId: createdOrderItem.id,
                                gstRuleId: gstItem.gstRuleId ?? null,
                                hsnCode: gstItem.hsnCode,
                                taxTreatment: gstItem.taxTreatment,
                                grossLineTotal: gstItem.grossLineTotal,
                                allocatedDiscountAmount: gstItem.allocatedDiscount,
                                netTaxableAmount: gstItem.netTaxableAmount,
                                cgstRate: gstItem.cgstRate,
                                sgstRate: gstItem.sgstRate,
                                igstRate: gstItem.igstRate,
                                cessRate: gstItem.cessRate,
                                cgstAmount: gstItem.cgstAmount,
                                sgstAmount: gstItem.sgstAmount,
                                igstAmount: gstItem.igstAmount,
                                cessAmount: gstItem.cessAmount,
                                totalTaxAmount: gstItem.totalTaxAmount,
                                isInclusivePrice: gstItem.isInclusive,
                            },
                        });
                    }
                }

                // C. Create immutable OrderTaxSnapshot if model supported
                if (tx.orderTaxSnapshot?.create) {
                    await tx.orderTaxSnapshot.create({
                        data: {
                            orderId: createdOrder.id,
                            sellerProfileId: defaultSeller.id,
                            sellerLegalName: defaultSeller.legalBusinessName,
                            sellerTradeName: defaultSeller.tradeName,
                            sellerGstin: defaultSeller.gstin,
                            sellerStateCode: defaultSeller.stateCode,
                            customerGstin: input?.customerGstin ?? null,
                            placeOfSupplyStateCode: gstResult.placeOfSupply.customerStateCode,
                            placeOfSupplyStateName: gstResult.placeOfSupply.customerStateName,
                            isInterState: gstResult.placeOfSupply.isInterState,
                            totalTaxableAmount: gstResult.totals.totalTaxableAmount,
                            totalCgstAmount: gstResult.totals.totalCgstAmount,
                            totalSgstAmount: gstResult.totals.totalSgstAmount,
                            totalIgstAmount: gstResult.totals.totalIgstAmount,
                            totalCessAmount: gstResult.totals.totalCessAmount,
                            totalTaxAmount: gstResult.totals.totalTaxAmount,
                            shippingTaxableAmount: gstResult.shipping.taxableAmount,
                            shippingGstRate: gstResult.shipping.gstRate,
                            shippingCgstAmount: gstResult.shipping.cgstAmount,
                            shippingSgstAmount: gstResult.shipping.sgstAmount,
                            shippingIgstAmount: gstResult.shipping.igstAmount,
                            calculationVersion: gstResult.calculationVersion,
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
                        newStatus: initialStatus,
                        changedBy: userId ?? null,
                        reason: isCod
                            ? "Order placed with Cash on Delivery (COD)"
                            : "Order placed by customer during checkout",
                    },
                });

                // E. Atomically reserve inventory units
                await orderInventoryService.reserveItemsForOrder(
                    tx,
                    createdOrder.id,
                    items.map((i) => ({ variantId: i.variantId, productName: i.productName, sku: i.sku, quantity: i.quantity })),
                );

                // Commit reservations immediately for COD since order is already confirmed
                if (isCod) {
                    for (const item of items) {
                        await tx.inventory.update({
                            where: { variantId: item.variantId },
                            data: { reservedQuantity: { decrement: item.quantity } },
                        });
                    }

                    await tx.inventoryReservation.updateMany({
                        where: { orderId: createdOrder.id, status: "ACTIVE" },
                        data: { status: "CONFIRMED" },
                    });

                    for (const item of items) {
                        await tx.inventoryTransaction.create({
                            data: {
                                variantId: item.variantId,
                                type: "ORDER_CONFIRMED",
                                quantity: item.quantity,
                                note: `Confirmed stock sale for COD Order ${createdOrder.id}`,
                                referenceType: "ORDER",
                                referenceId: createdOrder.id,
                            },
                        });
                    }
                }

                // F. Record coupon usage if coupon applied
                if (coupon) {
                    await orderCouponService.recordUsage(tx, coupon.id, createdOrder.id, couponDiscount, userId);
                }

                // G. Record promotion usages
                for (const promo of promoResult.appliedPromotions) {
                    await promotionUsageService.recordUsage(tx, promo.id, createdOrder.id, promo.discountAmount, userId);
                }

                // H. Create pending payment record for COD to collect upon delivery
                if (isCod) {
                    await tx.payment.create({
                        data: {
                            orderId: createdOrder.id,
                            provider: "COD",
                            paymentMethod: "CASH_ON_DELIVERY",
                            status: "PENDING",
                            currency: createdOrder.currency,
                            amount: createdOrder.grandTotal,
                            paidAmount: 0,
                        },
                    });
                }

                // I. Clear cart items when order is confirmed immediately
                if (isCod && cartId) {
                    await tx.cartItem.deleteMany({ where: { cartId } });
                }

                // J. Emit domain event for COD orders
                if (isCod) {
                    await tx.outboxEvent.create({
                        data: {
                            eventType: "ORDER_CONFIRMED",
                            aggregateType: "Order",
                            aggregateId: createdOrder.id,
                            payload: {
                                orderId: createdOrder.id,
                                orderNumber: createdOrder.orderNumber,
                                totalAmount: Number(createdOrder.grandTotal).toFixed(2),
                                amount: Number(createdOrder.grandTotal).toFixed(2),
                                currency: createdOrder.currency || "INR",
                                paymentMethod: "Cash on Delivery (COD)",
                                paymentStatus: "Pending (Pay on Delivery)",
                                previousStatus: null,
                                newStatus: "CONFIRMED",
                                userId: userId ?? null,
                                customerName: shippingAddress.recipientName,
                                changedBy: userId ?? null,
                                reason: "Order placed with Cash on Delivery (COD)",
                                timestamp: new Date().toISOString(),
                            },
                        },
                    });
                }

                return createdOrder;
            });

            // 7. Load populated order response
            const fullOrder = await prisma.order.findUnique({
                where: { id: order.id },
                include: {
                    items: true,
                    address: true,
                    statusHistory: { orderBy: { createdAt: "desc" } },
                    couponUsages: { include: { coupon: { select: { code: true, type: true } } } },
                    promotionUsages: { include: { promotion: { select: { name: true, code: true, type: true } } } },
                    reservations: { select: { id: true, status: true, expiresAt: true } },
                    payments: { select: { id: true, provider: true, paymentMethod: true, status: true, amount: true, paidAmount: true } },
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
            shippingAddress: order.address ? {
                recipientName: order.address.recipientName,
                phone: order.address.phone,
                addressLine1: order.address.addressLine1,
                addressLine2: order.address.addressLine2,
                city: order.address.city,
                state: order.address.state,
                postalCode: order.address.postalCode,
                country: order.address.country,
            } : null,
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
                hsnCode: item.taxSnapshot?.hsnCode ?? null,
                taxTreatment: item.taxSnapshot?.taxTreatment ?? null,
                taxBreakdown: item.taxSnapshot ? {
                    netTaxableAmount: Number(item.taxSnapshot.netTaxableAmount),
                    cgstRate: Number(item.taxSnapshot.cgstRate),
                    cgstAmount: Number(item.taxSnapshot.cgstAmount),
                    sgstRate: Number(item.taxSnapshot.sgstRate),
                    sgstAmount: Number(item.taxSnapshot.sgstAmount),
                    igstRate: Number(item.taxSnapshot.igstRate),
                    igstAmount: Number(item.taxSnapshot.igstAmount),
                    cessAmount: Number(item.taxSnapshot.cessAmount),
                } : null,
            })),
            taxSnapshot: order.taxSnapshot ? {
                sellerGstin: order.taxSnapshot.sellerGstin,
                sellerTradeName: order.taxSnapshot.sellerTradeName,
                customerGstin: order.taxSnapshot.customerGstin,
                placeOfSupplyStateCode: order.taxSnapshot.placeOfSupplyStateCode,
                placeOfSupplyStateName: order.taxSnapshot.placeOfSupplyStateName,
                isInterState: order.taxSnapshot.isInterState,
                totalTaxableAmount: Number(order.taxSnapshot.totalTaxableAmount),
                cgstTotal: Number(order.taxSnapshot.totalCgstAmount),
                sgstTotal: Number(order.taxSnapshot.totalSgstAmount),
                igstTotal: Number(order.taxSnapshot.totalIgstAmount),
                cessTotal: Number(order.taxSnapshot.totalCessAmount),
                totalTax: Number(order.taxSnapshot.totalTaxAmount),
                shippingTaxableAmount: Number(order.taxSnapshot.shippingTaxableAmount),
                shippingGstRate: Number(order.taxSnapshot.shippingGstRate),
            } : null,
            coupon: order.couponUsages?.[0] ? {
                code: order.couponUsages[0].coupon.code,
                type: order.couponUsages[0].coupon.type,
                discountAmount: Number(order.couponUsages[0].discountAmount),
            } : null,
            promotions: (order.promotionUsages || []).map((pu: any) => ({
                id: pu.promotionId,
                name: pu.promotion?.name,
                code: pu.promotion?.code,
                type: pu.promotion?.type,
                discountAmount: Number(pu.discountAmount),
            })),
            statusHistory: (order.statusHistory || []).map((sh: any) => ({
                id: sh.id,
                previousStatus: sh.previousStatus,
                newStatus: sh.newStatus,
                reason: sh.reason,
                changedBy: sh.changedBy,
                createdAt: sh.createdAt,
            })),
            reservations: order.reservations ?? [],
            payments: (order.payments || []).map((p: any) => ({
                id: p.id,
                provider: p.provider,
                paymentMethod: p.paymentMethod,
                status: p.status,
                amount: Number(p.amount),
                paidAmount: Number(p.paidAmount),
            })),
        };
    }
}

export const orderCreationService = new OrderCreationService();
