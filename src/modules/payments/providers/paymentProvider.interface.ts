export interface CreatePaymentIntentParams {
    orderId: string;
    orderNumber: string;
    amount: number;
    currency: string;
    paymentMethod?: string | undefined;
    customerEmail?: string | undefined;
    customerName?: string | undefined;
    returnUrl?: string | undefined;
    metadata?: Record<string, any> | undefined;
}

export interface PaymentIntentResult {
    providerPaymentId: string;
    clientSecret?: string | undefined;
    checkoutUrl?: string | undefined;
    status: "PENDING" | "PROCESSING" | "REQUIRES_ACTION" | "SUCCESS" | "FAILED";
    rawResponse?: Record<string, any> | undefined;
}

export interface WebhookEventData {
    provider: string;
    providerEventId: string;
    eventType: string;
    paymentId?: string | undefined;
    providerPaymentId?: string | undefined;
    orderId?: string | undefined;
    amount?: number | undefined;
    currency?: string | undefined;
    status: "SUCCESS" | "FAILED" | "PROCESSING" | "CANCELLED" | "REFUNDED";
    failureCode?: string | undefined;
    failureMessage?: string | undefined;
    rawPayload: any;
}

export interface CreateRefundParams {
    paymentId: string;
    providerPaymentId: string;
    amount: number;
    currency: string;
    reason?: string | undefined;
}

export interface RefundResult {
    providerRefundId: string;
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
    rawResponse?: Record<string, any> | undefined;
}

export interface IPaymentProvider {
    readonly name: string;

    /**
     * Initializes payment intent/session with provider gateway.
     */
    createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;

    /**
     * Cryptographically validates the webhook signature from headers.
     */
    verifyWebhookSignature(
        rawPayload: string | Buffer | Record<string, any>,
        signatureHeaders: Record<string, string | string[] | undefined>,
        secretKey?: string,
    ): Promise<boolean>;

    /**
     * Parses provider-specific webhook into unified WebhookEventData.
     */
    parseWebhookEvent(
        payload: any,
        headers?: Record<string, string | string[] | undefined>,
    ): Promise<WebhookEventData>;

    /**
     * Issues an external refund via provider gateway.
     */
    createRefund(params: CreateRefundParams): Promise<RefundResult>;

    /**
     * Fetches real-time status and balance from the provider gateway.
     */
    getPaymentDetails(providerPaymentId: string): Promise<{
        status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "REFUNDED";
        amount: number;
        currency: string;
        rawResponse?: Record<string, any> | undefined;
    }>;
}
