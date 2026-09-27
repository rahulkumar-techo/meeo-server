import type { Job } from "bullmq";
import { orderEventsConsumer } from "./orderEvents.consumer.js";
import { paymentEventsConsumer } from "./paymentEvents.consumer.js";
import { notificationConsumer } from "./notification.consumer.js";

export class EventRouter {
    /**
     * Routes an incoming BullMQ domain event job to its corresponding consumers.
     */
    async routeEvent(job: Job) {
        const event = job.data;
        const eventType: string = event.eventType || job.name;

        console.log(`[EventRouter] Routing event "${eventType}" (ID: ${event.id})`);

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

        if (consumersToCall.size === 0) {
            console.warn(`[EventRouter] No consumers registered for event "${eventType}"`);
            return { routed: false, eventType };
        }

        const promises = Array.from(consumersToCall).map((consumer) => consumer.handleEvent(event));
        const results = await Promise.all(promises);
        return { routed: true, eventType, results };
    }
}

export const eventRouter = new EventRouter();
