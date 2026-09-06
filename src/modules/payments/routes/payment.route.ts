import type { FastifyInstance } from "fastify";
import { paymentController } from "../controller/payment.controller.js";
import { paymentWebhookController } from "../controller/paymentWebhook.controller.js";
import { paymentSwaggerSchemas } from "@/common/docs/paymentDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Payment routes under /api/payments.
 */
export default async function paymentRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Provider Webhook Ingestion
    // ----------------------------------------------------
    app.post(
        "/webhook/:provider",
        {
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[Public / Webhook] Ingest Provider Webhook Event",
                description: "Idempotently processes incoming asynchronous webhook events from payment gateways (Mock, Stripe, Razorpay). Verifies cryptographic signatures, updates payment and order status, confirms inventory holds, and records domain outbox events.",
                params: {
                    type: "object",
                    required: ["provider"],
                    properties: {
                        provider: { type: "string", description: "Payment provider name (mock, stripe, razorpay)" },
                    },
                },
            },
        },
        paymentWebhookController.handleWebhook.bind(paymentWebhookController),
    );

    // ----------------------------------------------------
    // Payment Initialization & Retries
    // ----------------------------------------------------
    app.post(
        "/initialize",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Initialize Payment Intent",
                description: "Initializes a payment intent/session with the chosen payment gateway (Mock, Stripe, Razorpay) for an order in PENDING status.",
                body: paymentSwaggerSchemas.initializePayment,
            },
        },
        paymentController.initializePayment.bind(paymentController),
    );

    app.post(
        "/retry",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Retry Failed Payment",
                description: "Creates a new incremented payment attempt for an existing pending or failed payment record.",
                body: paymentSwaggerSchemas.retryPayment,
            },
        },
        paymentController.retryPayment.bind(paymentController),
    );

    // ----------------------------------------------------
    // Payment Queries & Details
    // ----------------------------------------------------
    app.get(
        "/:id",
        {
            preHandler: [app.optionalAuthenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Get Payment Details",
                description: "Fetches full payment breakdown including discrete attempts, ledger transactions, and refunds.",
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        paymentController.getPayment.bind(paymentController),
    );

    // ----------------------------------------------------
    // Refunds
    // ----------------------------------------------------
    app.post(
        "/refund",
        {
            preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.PAYMENT_REFUND)],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[Admin: payment:refund] Process Full or Partial Refund",
                description: "Issues a full or partial refund for a successful payment. Updates refundable balance, records ledger transaction, updates order status, and emits outbox events.",
                body: paymentSwaggerSchemas.refundPayment,
            },
        },
        paymentController.processRefund.bind(paymentController),
    );

    // ----------------------------------------------------
    // Reconciliation
    // ----------------------------------------------------
    app.post(
        "/reconcile",
        {
            preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.PAYMENT_READ)],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[Admin: payment:read] Reconcile Payment with Provider",
                description: "Queries external payment gateway to synchronize payment state and heal missed or delayed webhook events.",
                body: paymentSwaggerSchemas.reconcilePayment,
            },
        },
        paymentController.reconcilePayment.bind(paymentController),
    );

    // ----------------------------------------------------
    // Admin Listing
    // ----------------------------------------------------
    app.get(
        "/admin/list",
        {
            preHandler: [app.authenticate, app.requirePermission(PERMISSIONS.PAYMENT_READ)],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[Admin: payment:read] List All Payments",
                description: "Lists all platform payments with status filters and pagination.",
                querystring: paymentSwaggerSchemas.queryPayments,
            },
        },
        paymentController.listPayments.bind(paymentController),
    );
}
