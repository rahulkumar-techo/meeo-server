import { processedEventService } from "../../services/processedEvent.service.js";
import { notificationDispatcherService } from "@/modules/notifications/services/notificationDispatcher.service.js";
import { prisma } from "@/lib/prisma.js";

export class NotificationConsumer {
    private readonly consumerName = "NotificationConsumer";

    /**
     * Handles domain events by triggering appropriate multi-channel notifications asynchronously.
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

                // If Order aggregate and missing user/email details, query order to resolve recipient
                if (aggregateType === "Order" && (!userId || !email) && prisma.order?.findUnique) {
                    const order = await prisma.order.findUnique({
                        where: { id: aggregateId },
                        include: { user: true, address: true },
                    }).catch(() => null);

                    if (order) {
                        userId = userId || (order.userId ?? undefined);
                        email = email || (order.user?.email ?? undefined);
                        customerName = customerName || (order.user ? `${order.user.firstName || ""} ${order.user.lastName || ""}`.trim() : (order.address?.recipientName ?? undefined));
                    }
                }

                // If Payment aggregate and missing user/email details, query payment
                if (aggregateType === "Payment" && (!userId || !email) && prisma.payment?.findUnique) {
                    const payment = await prisma.payment.findUnique({
                        where: { id: aggregateId },
                        include: { order: { include: { user: true, address: true } } },
                    }).catch(() => null);

                    if (payment?.order) {
                        userId = userId || (payment.order.userId ?? undefined);
                        email = email || (payment.order.user?.email ?? undefined);
                        customerName = customerName || (payment.order.user ? `${payment.order.user.firstName || ""} ${payment.order.user.lastName || ""}`.trim() : (payment.order.address?.recipientName ?? undefined));
                    }
                }

                // If Low Stock event, notify system admins / store staff
                if (eventType === "LOW_STOCK" || eventType === "STOCK_LOW") {
                    const adminEmails = process.env.ADMIN_ALERT_EMAILS?.split(",") || ["admin@store.com"];
                    for (const adminEmail of adminEmails) {
                        await notificationDispatcherService.sendNotificationForEvent(
                            "LOW_STOCK",
                            { email: adminEmail.trim(), customerName: "Store Administrator" },
                            payload,
                        );
                    }
                    return { success: true, eventType, lowStockAlertSent: true };
                }

                // Dispatch notification for order/payment event
                return notificationDispatcherService.sendNotificationForEvent(
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
