import { processedEventService } from "@/modules/outbox/services/processedEvent.service.js";

export interface PaymentEventPayload {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: {
        paymentId?: string;
        orderId?: string;
        amount?: number;
        currency?: string;
        provider?: string;
        status?: string;
        reason?: string;
        [key: string]: any;
    };
    createdAt?: string | Date;
}

export class PaymentEventsConsumer {
    private readonly consumerName = "PaymentEventsConsumer";

    async handleEvent(event: PaymentEventPayload) {
        return processedEventService.runWithConsumerIdempotency(
            this.consumerName,
            event.id,
            async () => {
                const { eventType, aggregateId, payload } = event;

                switch (eventType) {
                    case "ORDER_PAID":
                    case "PAYMENT_SUCCESS":
                        console.log(
                            `[PaymentEventsConsumer] Processing ${eventType} for Payment ${aggregateId} (Order: ${payload?.orderId || payload?.orderNumber || "N/A"}, Amount: ${payload?.amount ?? "N/A"} ${payload?.currency || "INR"})`,
                        );
                        break;
                    case "PAYMENT_FAILED":
                        console.log(
                            `[PaymentEventsConsumer] Processing PAYMENT_FAILED for Payment ${aggregateId} (Reason: ${payload?.reason || "Unknown"})`,
                        );
                        break;
                    case "PAYMENT_REFUNDED":
                    case "REFUND_INITIATED":
                        console.log(
                            `[PaymentEventsConsumer] Processing ${eventType} for Payment ${aggregateId} (Refund Amount: ${payload?.amount ?? "N/A"})`,
                        );
                        break;
                    default:
                        console.log(`[PaymentEventsConsumer] Unhandled payment event type: ${eventType}`);
                }

                return { processed: true, eventType, paymentId: aggregateId };
            },
        );
    }
}

export const paymentEventsConsumer = new PaymentEventsConsumer();
