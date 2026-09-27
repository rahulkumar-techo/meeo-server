import { processedEventService } from "@/modules/outbox/services/processedEvent.service.js";

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
                    case "ORDER_CREATED":
                    case "ORDER_PAID":
                    case "ORDER_CONFIRMED":
                        console.log(`[OrderEventsConsumer] Processing ${eventType} for Order #${orderNumber}`);
                        break;
                    case "ORDER_PROCESSING":
                        console.log(`[OrderEventsConsumer] Processing ORDER_PROCESSING for Order #${orderNumber}`);
                        break;
                    case "ORDER_SHIPPED":
                    case "ORDER_OUT_FOR_DELIVERY":
                        console.log(
                            `[OrderEventsConsumer] Processing ${eventType} for Order #${orderNumber} (Carrier: ${payload?.carrier || "Standard"}, Tracking: ${payload?.trackingNumber || "N/A"})`,
                        );
                        break;
                    case "ORDER_DELIVERED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_DELIVERED for Order #${orderNumber}`);
                        break;
                    case "ORDER_CANCELLED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_CANCELLED for Order #${orderNumber}`);
                        break;
                    case "ORDER_EXPIRED":
                        console.log(`[OrderEventsConsumer] Processing ORDER_EXPIRED for Order #${orderNumber}`);
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
