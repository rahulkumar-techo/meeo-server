import crypto from "crypto";
import type {
    IPaymentProvider,
    CreatePaymentIntentParams,
    PaymentIntentResult,
    WebhookEventData,
    CreateRefundParams,
    RefundResult,
} from "./paymentProvider.interface.js";

export class MockPaymentProvider implements IPaymentProvider {
    readonly name = "MOCK";
    private readonly defaultSecret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET || "mock_webhook_secret_key_12345";

    async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
        const randomId = crypto.randomBytes(8).toString("hex");
        const providerPaymentId = `mock_pay_${randomId}`;

        // In mock mode, check if caller provided deterministic status in metadata
        const mockStatus = params.metadata?.mockStatus || "REQUIRES_ACTION";

        return {
            providerPaymentId,
            clientSecret: `mock_sec_${randomId}`,
            checkoutUrl: `https://checkout.example.com/pay/${providerPaymentId}`,
            status: mockStatus,
            rawResponse: {
                id: providerPaymentId,
                amount: params.amount,
                currency: params.currency,
                orderId: params.orderId,
                orderNumber: params.orderNumber,
                created: Date.now(),
            },
        };
    }

    async verifyWebhookSignature(
        rawPayload: string | Buffer | Record<string, any>,
        headers: Record<string, string | string[] | undefined>,
        secretKey?: string,
    ): Promise<boolean> {
        const signature = (headers["x-mock-signature"] || headers["x-webhook-signature"] || "") as string;
        const secret = secretKey || this.defaultSecret;

        if (!signature) {
            // If running in development/test and signature header is bypass
            if (process.env.NODE_ENV === "test" && headers["x-test-bypass-signature"] === "true") {
                return true;
            }
            return false;
        }

        const payloadStr = typeof rawPayload === "string" 
            ? rawPayload 
            : Buffer.isBuffer(rawPayload) 
                ? rawPayload.toString("utf8") 
                : JSON.stringify(rawPayload);

        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(payloadStr)
            .digest("hex");

        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expBuf.length) {
            return false;
        }

        return crypto.timingSafeEqual(sigBuf, expBuf);
    }

    async parseWebhookEvent(
        payload: any,
        _headers?: Record<string, string | string[] | undefined>,
    ): Promise<WebhookEventData> {
        const eventId = payload.id || `evt_${crypto.randomBytes(6).toString("hex")}`;
        const eventType = payload.type || payload.eventType || "payment_intent.succeeded";
        const data = payload.data?.object || payload.data || payload;

        let status: "SUCCESS" | "FAILED" | "PROCESSING" | "CANCELLED" | "REFUNDED" = "SUCCESS";
        if (eventType.includes("failed") || eventType.includes("declined")) {
            status = "FAILED";
        } else if (eventType.includes("refund")) {
            status = "REFUNDED";
        } else if (eventType.includes("canceled") || eventType.includes("cancelled")) {
            status = "CANCELLED";
        } else if (eventType.includes("processing")) {
            status = "PROCESSING";
        }

        return {
            provider: "MOCK",
            providerEventId: eventId,
            eventType,
            paymentId: data.paymentId || data.metadata?.paymentId,
            providerPaymentId: data.providerPaymentId || data.id,
            orderId: data.orderId || data.metadata?.orderId,
            amount: data.amount ? Number(data.amount) : undefined,
            currency: data.currency,
            status,
            failureCode: data.failureCode || (status === "FAILED" ? "MOCK_PAYMENT_DECLINED" : undefined),
            failureMessage: data.failureMessage || (status === "FAILED" ? "Simulated test decline" : undefined),
            rawPayload: payload,
        };
    }

    async createRefund(params: CreateRefundParams): Promise<RefundResult> {
        const randomId = crypto.randomBytes(6).toString("hex");
        return {
            providerRefundId: `mock_ref_${randomId}`,
            status: "SUCCESS",
            rawResponse: {
                id: `mock_ref_${randomId}`,
                paymentId: params.paymentId,
                amount: params.amount,
                currency: params.currency,
                reason: params.reason,
                status: "succeeded",
                created: Date.now(),
            },
        };
    }

    async getPaymentDetails(providerPaymentId: string): Promise<{
        status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "REFUNDED";
        amount: number;
        currency: string;
        rawResponse?: Record<string, any>;
    }> {
        return {
            status: "SUCCESS",
            amount: 100,
            currency: "USD",
            rawResponse: { id: providerPaymentId, status: "succeeded" },
        };
    }
}
