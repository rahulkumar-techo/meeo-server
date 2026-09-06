import { processedEventService } from "../../services/processedEvent.service.js";

export interface OrderEventPayload {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: {
        orderId?: string;
        orderNumber?: string;
        previousStatus?: string;
        newStatus?: string;
        customerEmail?: string;
        carrier?: string;
        trackingNumber?: string;
        reason?: string;
        [key: string]: any;
    };
    createdAt?: string | Date;
}

export class OrderEventsConsumer {
    private readonly consumerName = "OrderEventsConsumer";

    async handleEvent(event: OrderEventPayload) {
        return processedEventService.runWithConsumerIdempotency(
            this.consumerName,
            event.id,
            async () => {
                const { eventType, aggregateId, payload } = event;
                const orderNumber = payload?.orderNumber ?? aggregateId;

                switch (eventType) {
                    case "ORDER_CONFIRMED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_CONFIRMED for Order #${orderNumber}`);
                        // Example: Trigger order confirmation email, generate invoice PDF, notify logistics
                        break;

                    case "ORDER_PROCESSING":
                        console.log(`[OrderEventsConsumer] Processing ORDER_PROCESSING for Order #${orderNumber}`);
                        // Example: Notify warehouse fulfillment system
                        break;

                    case "ORDER_SHIPPED":
                        console.log(
                            `[OrderEventsConsumer] Processing ORDER_SHIPPED for Order #${orderNumber} (Carrier: ${payload?.carrier}, Tracking: ${payload?.trackingNumber})`,
                        );
                        // Example: Send shipping dispatch email/SMS with tracking link
                        break;

                    case "ORDER_DELIVERED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_DELIVERED for Order #${orderNumber}`);
                        // Example: Send delivery feedback request / request review
                        break;

                    case "ORDER_CANCELLED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_CANCELLED for Order #${orderNumber}`);
                        // Example: Send cancellation email and notify accounting
                        break;

                    case "ORDER_EXPIRED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_EXPIRED for Order #${orderNumber}`);
                        // Example: Send cart recovery reminder / expiration notification
                        break;

                    default:
                        console.log(`[OrderEventsConsumer] Unhandled order event type: ${eventType}`);
                }

                return { processed: true, eventType, orderId: aggregateId };
            },
        );
    }
}

export const orderEventsConsumer = new OrderEventsConsumer();
