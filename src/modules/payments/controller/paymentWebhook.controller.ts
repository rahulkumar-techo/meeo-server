import type { FastifyRequest, FastifyReply } from "fastify";
import { paymentService } from "../services/payment.service.js";

export class PaymentWebhookController {
    /**
     * Receives and handles asynchronous provider webhook events.
     */
    async handleWebhook(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const { provider } = request.params as { provider: string };
        const result = await paymentService.processWebhook(
            provider,
            request.body,
            request.headers as Record<string, string | string[] | undefined>,
        );

        return reply.status(200).send({
            received: true,
            ...result,
        });
    }
}

export const paymentWebhookController = new PaymentWebhookController();
