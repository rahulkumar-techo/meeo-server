import type { FastifyInstance } from "fastify";
import { paymentController } from "../controller/payment.controller.js";
import { paymentSwaggerSchemas } from "@/common/docs/paymentDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Payment routes under /api/v1/payments.
 */
export default async function paymentRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Payment Initialization & Retries
    // ----------------------------------------------------
    app.post(
        "/initialize",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Initialize Razorpay Payment Intent",
                description: "Initializes a payment session with Razorpay for an order in PENDING status.",
                body: paymentSwaggerSchemas.initializePayment,
            },
        },
        paymentController.initializePayment.bind(paymentController),
    );

    app.post(
        "/verify",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Verify Payment Signature",
                description: "Directly verifies Razorpay payment signature from client SDK and marks payment and order as CONFIRMED atomically.",
                body: paymentSwaggerSchemas.verifyPayment,
            },
        },
        paymentController.verifyPayment.bind(paymentController),
    );

    app.post(
        "/fail",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Payments & Transactions"],
                summary: "[User / Public] Record Payment Failure / Cancellation",
                description: "Records payment failure or user cancellation from client SDK and marks attempt/payment as FAILED while keeping the order eligible for retry.",
                body: paymentSwaggerSchemas.recordPaymentFailure,
            },
        },
        paymentController.failPayment.bind(paymentController),
    );

    app.post(
        "/retry",
        {
            preHandler: [app.authenticate],
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
            preHandler: [app.authenticate],
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
                description: "Issues a full or partial refund for a successful payment with Razorpay.",
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
                description: "Queries Razorpay API to synchronize payment state.",
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
