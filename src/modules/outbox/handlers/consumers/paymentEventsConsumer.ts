import { processedEventService } from "../../services/processedEvent.service.js";

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
                    case "PAYMENT_SUCCESS":
                        console.log(
                            `[PaymentEventsConsumer] Processing PAYMENT_SUCCESS for Payment ${aggregateId} (Order: ${payload?.orderId}, Amount: ${payload?.amount} ${payload?.currency})`,
                        );
                        // Example: Issue customer payment receipt, update ledger balances
                        break;

                    case "PAYMENT_FAILED":
                        console.log(
                            `[PaymentEventsConsumer] Processing PAYMENT_FAILED for Payment ${aggregateId} (Reason: ${payload?.reason})`,
                        );
                        // Example: Send payment failure alert with retry checkout link
                        break;

                    case "PAYMENT_REFUNDED":
                        console.log(
                            `[PaymentEventsConsumer] Processing PAYMENT_REFUNDED for Payment ${aggregateId} (Refund Amount: ${payload?.amount})`,
                        );
                        // Example: Send refund confirmation note, update financial accounts
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
