import { orderEventsConsumer } from "./consumers/orderEventsConsumer.js";
import { paymentEventsConsumer } from "./consumers/paymentEventsConsumer.js";
import { notificationConsumer } from "./consumers/notificationConsumer.js";
import type { Job } from "bullmq";

export class EventRouter {
    /**
     * Routes an incoming BullMQ domain event job to its corresponding consumers.
     */
    async routeEvent(job: Job) {
        const event = job.data;
        const eventType: string = event.eventType || job.name;

        console.log(`[EventRouter] Routing event "${eventType}" (ID: ${event.id})`);

        const promises: Promise<any>[] = [];

        // Route Order Events
        if (eventType.startsWith("ORDER_") || event.aggregateType === "Order") {
            promises.push(orderEventsConsumer.handleEvent(event));
            promises.push(notificationConsumer.handleEvent(event));
        }

        // Route Payment Events
        if (eventType.startsWith("PAYMENT_") || event.aggregateType === "Payment") {
            promises.push(paymentEventsConsumer.handleEvent(event));
            promises.push(notificationConsumer.handleEvent(event));
        }

        // Route Inventory / Low Stock Events
        if (eventType.startsWith("LOW_STOCK") || eventType.startsWith("STOCK_")) {
            promises.push(notificationConsumer.handleEvent(event));
        }

        if (promises.length === 0) {
            console.warn(`[EventRouter] No consumers registered for event "${eventType}"`);
            return { routed: false, eventType };
        }

        const results = await Promise.all(promises);
        return { routed: true, eventType, results };
    }
}

export const eventRouter = new EventRouter();
