import type { FastifyInstance } from "fastify";
import { reviewController } from "../controller/review.controller.js";
import { reviewSwaggerSchemas } from "@/common/docs/reviewDocs.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers Reviews & Ratings routes under /api/reviews.
 */
export default async function reviewRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Storefront Endpoints
    // ----------------------------------------------------
    app.get(
        "/products/:productId",
        {
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Public] Get approved product reviews with star distribution summary",
                description: "Retrieves approved customer ratings, reviews, photos, verified purchase badges, and rating summary for a product.",
                params: {
                    type: "object",
                    required: ["productId"],
                    properties: {
                        productId: { type: "string", format: "uuid" },
                    },
                },
                querystring: reviewSwaggerSchemas.reviewQuery,
            },
        },
        reviewController.getProductReviews.bind(reviewController),
    );

    app.get(
        "/products/:productId/summary",
        {
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Public] Get product rating summary and star breakdown",
                description: "Retrieves average rating score, total review count, verified purchase count, and star distribution (1 to 5 stars).",
                params: {
                    type: "object",
                    required: ["productId"],
                    properties: {
                        productId: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        reviewController.getProductSummary.bind(reviewController),
    );

    // ----------------------------------------------------
    // Customer (Authenticated User) Endpoints
    // ----------------------------------------------------
    app.get(
        "/my-reviews",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Authenticated User] My submitted reviews history",
                description: "Retrieves all reviews submitted by the authenticated customer across products with moderation status.",
                security: [{ bearerAuth: [] }],
                querystring: reviewSwaggerSchemas.reviewQuery,
            },
        },
        reviewController.getMyReviews.bind(reviewController),
    );

    app.post(
        "/",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Authenticated User] Submit a product review",
                description: "Submits a 1-5 star rating and optional title, content, and images. Automatically determines if customer has a verified purchase.",
                security: [{ bearerAuth: [] }],
                body: reviewSwaggerSchemas.createReview,
            },
        },
        reviewController.createReview.bind(reviewController),
    );

    app.put(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Authenticated User] Update my review",
                description: "Updates an existing review and resets its status to PENDING for moderation re-check.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: reviewSwaggerSchemas.updateReview,
            },
        },
        reviewController.updateReview.bind(reviewController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Authenticated User / Admin] Delete a review",
                description: "Deletes a review. Review owners can delete their own reviews; Admins can delete any review.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        reviewController.deleteReview.bind(reviewController),
    );

    app.post(
        "/:id/report",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Authenticated User] Report a review for abuse/spam",
                description: "Flags a review for inappropriate content, fake review, spam, or harassment to alert administrators.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: reviewSwaggerSchemas.reportReview,
            },
        },
        reviewController.reportReview.bind(reviewController),
    );

    // ----------------------------------------------------
    // Admin Review Moderation & Abuse Report Resolution
    // ----------------------------------------------------
    app.get(
        "/admin/all",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_READ),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:read] List all platform reviews",
                description: "Lists all reviews across all statuses (PENDING, APPROVED, REJECTED) with filtering.",
                security: [{ bearerAuth: [] }],
                querystring: reviewSwaggerSchemas.reviewQuery,
            },
        },
        reviewController.listAllReviews.bind(reviewController),
    );

    app.get(
        "/admin/queue",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] Pending moderation queue",
                description: "Lists reviews waiting in the moderation queue (status: PENDING).",
                security: [{ bearerAuth: [] }],
                querystring: reviewSwaggerSchemas.reviewQuery,
            },
        },
        reviewController.getModerationQueue.bind(reviewController),
    );

    app.patch(
        "/admin/:id/moderate",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] Moderate single review",
                description: "Approves or rejects a customer review with admin audit notes.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: reviewSwaggerSchemas.moderateReview,
            },
        },
        reviewController.moderateReview.bind(reviewController),
    );

    app.post(
        "/admin/bulk-moderate",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] Bulk moderate reviews",
                description: "Approves or rejects multiple reviews simultaneously.",
                security: [{ bearerAuth: [] }],
                body: reviewSwaggerSchemas.bulkModerate,
            },
        },
        reviewController.bulkModerateReviews.bind(reviewController),
    );

    app.get(
        "/admin/reports",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] List abuse reports",
                description: "Lists all spam/abuse reports submitted by users with status and reason filters.",
                security: [{ bearerAuth: [] }],
                querystring: reviewSwaggerSchemas.reportQuery,
            },
        },
        reviewController.listReports.bind(reviewController),
    );

    app.get(
        "/admin/reports/:id",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] Get report details",
                description: "Retrieves details of an abuse report including reporter, target review, and review author.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        reviewController.getReportById.bind(reviewController),
    );

    app.patch(
        "/admin/reports/:id/resolve",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.REVIEW_MODERATE),
            ],
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Admin: review:moderate] Resolve abuse report",
                description: "Resolves an abuse report and optionally approves, rejects, or deletes the target review.",
                security: [{ bearerAuth: [] }],
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
                body: reviewSwaggerSchemas.resolveReport,
            },
        },
        reviewController.resolveReport.bind(reviewController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Reviews & Ratings"],
                summary: "[Public] Get review by ID",
                description: "Retrieves a single review by its unique ID.",
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        reviewController.getReviewById.bind(reviewController),
    );
}
