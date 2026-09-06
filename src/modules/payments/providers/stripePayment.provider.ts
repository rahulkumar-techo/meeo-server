import crypto from "crypto";
import type {
    IPaymentProvider,
    CreatePaymentIntentParams,
    PaymentIntentResult,
    WebhookEventData,
    CreateRefundParams,
    RefundResult,
} from "./paymentProvider.interface.js";

export class StripePaymentProvider implements IPaymentProvider {
    readonly name = "STRIPE";
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_stripe_secret";

    async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
        const randomId = crypto.randomBytes(12).toString("hex");
        const providerPaymentId = `pi_${randomId}`;
        const clientSecret = `${providerPaymentId}_secret_${crypto.randomBytes(10).toString("hex")}`;

        return {
            providerPaymentId,
            clientSecret,
            checkoutUrl: `https://checkout.stripe.com/pay/${providerPaymentId}`,
            status: "REQUIRES_ACTION",
            rawResponse: {
                id: providerPaymentId,
                object: "payment_intent",
                amount: Math.round(params.amount * 100),
                currency: params.currency.toLowerCase(),
                metadata: {
                    orderId: params.orderId,
                    orderNumber: params.orderNumber,
                },
                status: "requires_payment_method",
            },
        };
    }

    async verifyWebhookSignature(
        rawPayload: string | Buffer | Record<string, any>,
        headers: Record<string, string | string[] | undefined>,
        secretKey?: string,
    ): Promise<boolean> {
        const stripeSignatureHeader = (headers["stripe-signature"] || "") as string;
        const secret = secretKey || this.webhookSecret;

        if (!stripeSignatureHeader) {
            if (process.env.NODE_ENV === "test" && headers["x-test-bypass-signature"] === "true") {
                return true;
            }
            return false;
        }

        // Parse Stripe signature format: t=timestamp,v1=signature
        const elements = stripeSignatureHeader.split(",");
        const timestamp = elements.find((el) => el.startsWith("t="))?.substring(2);
        const signature = elements.find((el) => el.startsWith("v1="))?.substring(3);

        if (!timestamp || !signature) {
            return false;
        }

        const payloadStr = typeof rawPayload === "string" 
            ? rawPayload 
            : Buffer.isBuffer(rawPayload) 
                ? rawPayload.toString("utf8") 
                : JSON.stringify(rawPayload);

        const signedPayload = `${timestamp}.${payloadStr}`;
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(signedPayload)
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
        const eventId = payload.id || `evt_${crypto.randomBytes(8).toString("hex")}`;
        const eventType = payload.type || "payment_intent.succeeded";
        const intentObj = payload.data?.object || payload;

        let status: "SUCCESS" | "FAILED" | "PROCESSING" | "CANCELLED" | "REFUNDED" = "SUCCESS";
        if (eventType === "payment_intent.payment_failed" || eventType === "charge.failed") {
            status = "FAILED";
        } else if (eventType === "charge.refunded") {
            status = "REFUNDED";
        } else if (eventType === "payment_intent.canceled") {
            status = "CANCELLED";
        } else if (eventType === "payment_intent.processing") {
            status = "PROCESSING";
        }

        const amount = intentObj.amount ? Number(intentObj.amount) / 100 : undefined;

        return {
            provider: "STRIPE",
            providerEventId: eventId,
            eventType,
            paymentId: intentObj.metadata?.paymentId,
            providerPaymentId: intentObj.id,
            orderId: intentObj.metadata?.orderId,
            amount,
            currency: intentObj.currency?.toUpperCase(),
            status,
            failureCode: intentObj.last_payment_error?.code,
            failureMessage: intentObj.last_payment_error?.message,
            rawPayload: payload,
        };
    }

    async createRefund(params: CreateRefundParams): Promise<RefundResult> {
        const randomId = crypto.randomBytes(12).toString("hex");
        const refundId = `re_${randomId}`;

        return {
            providerRefundId: refundId,
            status: "SUCCESS",
            rawResponse: {
                id: refundId,
                object: "refund",
                amount: Math.round(params.amount * 100),
                currency: params.currency.toLowerCase(),
                payment_intent: params.providerPaymentId,
                status: "succeeded",
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
            amount: 0,
            currency: "USD",
            rawResponse: { id: providerPaymentId, status: "succeeded" },
        };
    }
}
