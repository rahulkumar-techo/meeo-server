import { processedEventService } from "@/modules/outbox/services/processedEvent.service.js";
import { notificationDeliveryService } from "../services/notificationDelivery.service.js";
import { prisma } from "@/lib/prisma.js";

export class NotificationConsumer {
    private readonly consumerName = "NotificationConsumer";

    /**
     * Handles domain events by triggering push & email notifications for customer scenarios:
     * - Order (important order-state changes)
     * - Payment (payment requires attention / receipt)
     * - Delivery (delivery status changes)
     * - Return/Refund (return/refund progress or actions)
     * - Account/Security (security-critical events)
     */
    async handleEvent(event: {
        id: string;
        eventType: string;
        aggregateType: string;
        aggregateId: string;
        payload: Record<string, any>;
        createdAt?: string | Date;
    }) {
        return processedEventService.runWithConsumerIdempotency(
            this.consumerName,
            event.id,
            async () => {
                const { eventType, aggregateType, aggregateId, payload } = event;

                console.log(`[NotificationConsumer] Handling event ${eventType} for ${aggregateType}:${aggregateId}`);

                // Resolve user/recipient details
                let userId = payload.userId as string | undefined;
                let email = (payload.customerEmail || payload.email) as string | undefined;
                let customerName = (payload.customerName || payload.name) as string | undefined;

                // If Order aggregate or orderId provided, resolve recipient and enrich financial/payment details
                const orderId = aggregateType === "Order" ? aggregateId : payload.orderId;
                if (orderId && (!userId || !email || payload.totalAmount === undefined || !payload.paymentMethod) && typeof prisma.order?.findUnique === "function") {
                    const order = await Promise.resolve(
                        prisma.order.findUnique({
                            where: { id: orderId },
                            include: {
                                user: true,
                                address: true,
                                payments: { orderBy: { createdAt: "desc" }, take: 1 },
                            },
                        }),
                    ).catch(() => null);

                    if (order) {
                        userId = userId || (order.userId ?? undefined);
                        email = email || (order.user?.email ?? undefined);
                        customerName = customerName || (order.user ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() : (order.address?.recipientName ?? undefined));

                        payload.orderNumber = payload.orderNumber || order.orderNumber;
                        payload.currency = payload.currency || (order.currency === "INR" ? "₹" : order.currency) || "₹";
                        if (payload.totalAmount === undefined && payload.amount === undefined) {
                            payload.totalAmount = order.grandTotal != null ? Number(order.grandTotal).toFixed(2) : "0.00";
                            payload.amount = payload.totalAmount;
                        } else if (payload.totalAmount === undefined) {
                            payload.totalAmount = payload.amount;
                        }

                        const latestPayment = order.payments?.[0];
                        const isCod = latestPayment?.provider === "COD" || latestPayment?.paymentMethod === "CASH_ON_DELIVERY" || payload.paymentMethod === "COD";

                        if (!payload.paymentMethod) {
                            if (isCod) {
                                payload.paymentMethod = "Cash on Delivery (COD)";
                            } else if (latestPayment?.provider === "RAZORPAY") {
                                payload.paymentMethod = "Online (Razorpay)";
                            } else if (latestPayment?.paymentMethod) {
                                payload.paymentMethod = latestPayment.paymentMethod;
                            } else {
                                payload.paymentMethod = "Cash on Delivery (COD)";
                            }
                        }

                        if (!payload.paymentStatus) {
                            if (latestPayment?.status === "SUCCESS" || latestPayment?.status === "PAID") {
                                payload.paymentStatus = "Paid";
                            } else if (latestPayment?.status === "FAILED") {
                                payload.paymentStatus = "Failed";
                            } else if (isCod) {
                                payload.paymentStatus = "Pending (Pay on Delivery)";
                            } else {
                                payload.paymentStatus = latestPayment?.status || "Pending";
                            }
                        }
                    }
                }

                // If Payment / Refund aggregate, resolve details
                const paymentId = (aggregateType === "Payment" || aggregateType === "Refund") ? aggregateId : payload.paymentId;
                if (paymentId && (!userId || !email || payload.totalAmount === undefined || !payload.paymentMethod) && typeof prisma.payment?.findUnique === "function") {
                    const payment = await Promise.resolve(
                        prisma.payment.findUnique({
                            where: { id: paymentId },
                            include: { order: { include: { user: true, address: true } } },
                        }),
                    ).catch(() => null);

                    if (payment) {
                        if (payment.order) {
                            userId = userId || (payment.order.userId ?? undefined);
                            email = email || (payment.order.user?.email ?? undefined);
                            customerName = customerName || (payment.order.user ? `${payment.order.user.firstName || ""} ${payment.order.user.lastName || ""}`.trim() : (payment.order.address?.recipientName ?? undefined));
                            payload.orderNumber = payload.orderNumber || payment.order.orderNumber;
                        }
                        payload.currency = payload.currency || (payment.currency === "INR" ? "₹" : payment.currency) || "₹";
                        if (payload.totalAmount === undefined && payload.amount === undefined) {
                            payload.totalAmount = payment.amount != null ? Number(payment.amount).toFixed(2) : "0.00";
                            payload.amount = payload.totalAmount;
                        }
                        if (!payload.paymentMethod) {
                            payload.paymentMethod = payment.paymentMethod || (payment.provider === "COD" ? "Cash on Delivery (COD)" : payment.provider === "RAZORPAY" ? "Online (Razorpay)" : payment.provider);
                        }
                        if (!payload.paymentStatus) {
                            payload.paymentStatus = payment.status === "SUCCESS" ? "Paid" : payment.status;
                        }
                    }
                }

                // If User security aggregate, query user
                if (aggregateType === "User" && (!userId || !email) && typeof prisma.user?.findUnique === "function") {
                    const user = await Promise.resolve(
                        prisma.user.findUnique({
                            where: { id: aggregateId },
                            select: { id: true, email: true, firstName: true, lastName: true },
                        }),
                    ).catch(() => null);

                    if (user) {
                        userId = userId || user.id;
                        email = email || (user.email ?? undefined);
                        customerName = customerName || `${user.firstName || ""} ${user.lastName || ""}`.trim();
                    }
                }

                // If Low Stock event, notify system admins / store staff
                if (eventType === "LOW_STOCK" || eventType === "STOCK_LOW") {
                    const adminEmails = process.env.ADMIN_ALERT_EMAILS?.split(",") || ["admin@store.com"];
                    for (const adminEmail of adminEmails) {
                        await notificationDeliveryService.sendNotificationForEvent(
                            "LOW_STOCK",
                            { email: adminEmail.trim(), customerName: "Store Administrator" },
                            payload,
                        );
                    }
                    return { success: true, eventType, lowStockAlertSent: true };
                }

                // Dispatch push and mail notification for customer event via delivery service
                return notificationDeliveryService.sendNotificationForEvent(
                    eventType,
                    {
                        userId,
                        email,
                        customerName,
                    },
                    payload,
                );
            },
        );
    }
}

export const notificationConsumer = new NotificationConsumer();
