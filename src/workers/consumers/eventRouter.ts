import type { Job } from "bullmq";
import { logger } from "@/common/observability/logger.js";
import { orderEventsConsumer } from "./orderEvents.consumer.js";
import { paymentEventsConsumer } from "./paymentEvents.consumer.js";
import { notificationConsumer } from "./notification.consumer.js";
import { systemAlertConsumer } from "./systemAlert.consumer.js";

export class EventRouter {
    /**
     * Routes an incoming BullMQ domain event job to its corresponding consumers.
     */
    async routeEvent(job: Job) {
        const event = job.data;
        const eventType: string = event.eventType || job.name;

        logger.info({ eventType, eventId: event.id }, "[EventRouter] Routing domain event to consumers");

        const consumersToCall = new Set<{ handleEvent: (event: any) => Promise<any> }>();

        // Route Order & Delivery Events
        if (eventType.startsWith("ORDER_") || event.aggregateType === "Order") {
            consumersToCall.add(orderEventsConsumer);
            consumersToCall.add(notificationConsumer);
        }

        // Route Payment & Refund Events
        if (
            eventType.startsWith("PAYMENT_") ||
            eventType.startsWith("REFUND_") ||
            eventType.startsWith("RETURN_") ||
            event.aggregateType === "Payment" ||
            event.aggregateType === "Refund"
        ) {
            consumersToCall.add(paymentEventsConsumer);
            consumersToCall.add(notificationConsumer);
        }

        // Route Account / Security Events
        if (
            eventType.startsWith("ACCOUNT_") ||
            eventType.startsWith("SECURITY_") ||
            eventType.startsWith("USER_") ||
            event.aggregateType === "User"
        ) {
            consumersToCall.add(notificationConsumer);
        }

        // Route Inventory / Low Stock Events
        if (eventType.startsWith("LOW_STOCK") || eventType.startsWith("STOCK_")) {
            consumersToCall.add(notificationConsumer);
        }

        // Route Operational & System Alert Events
        if (
            eventType === "SERVER_5XX_ALERT" ||
            eventType.startsWith("SYSTEM_") ||
            eventType.startsWith("ALERT_") ||
            event.aggregateType === "System"
        ) {
            consumersToCall.add(systemAlertConsumer);
        }

        if (consumersToCall.size === 0) {
            logger.warn({ eventType }, "[EventRouter] No consumers registered for domain event");
            return { routed: false, eventType };
        }

        const promises = Array.from(consumersToCall).map((consumer) => consumer.handleEvent(event));
        const results = await Promise.all(promises);
        return { routed: true, eventType, results };
    }
}

export const eventRouter = new EventRouter();
