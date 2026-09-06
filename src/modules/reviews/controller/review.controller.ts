import type { FastifyRequest, FastifyReply } from "fastify";
import { reviewService } from "../services/review.service.js";
import { reviewModerationService } from "../services/reviewModeration.service.js";
import { reviewReportService } from "../services/reviewReport.service.js";
import {
    createReviewSchema,
    updateReviewSchema,
    reviewQuerySchema,
    moderateReviewSchema,
    bulkModerateReviewsSchema,
    reportReviewSchema,
    reviewReportQuerySchema,
    resolveReportSchema,
} from "../validations/review.validation.js";

export class ReviewController {
    /**
     * Submit a rating and review for a product.
     */
    async createReview(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const input = createReviewSchema.parse(req.body);
        const result = await reviewService.createReview(userId, input);

        return reply.status(201).send({
            status: "success",
            message: "Review submitted successfully. It is pending moderation before being publicly visible.",
            data: result,
        });
    }

    /**
     * Update an existing product review.
     */
    async updateReview(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const userId = req.user!.id;
        const input = updateReviewSchema.parse(req.body);
        const result = await reviewService.updateReview(id, userId, input);

        return reply.status(200).send({
            status: "success",
            message: "Review updated successfully. It has been re-submitted for moderation.",
            data: result,
        });
    }

    /**
     * Delete a review.
     */
    async deleteReview(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const userId = req.user!.id;
        const roles = req.user?.roles || [];
        const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
        const result = await reviewService.deleteReview(id, userId, isAdmin);

        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }

    /**
     * Public feed of approved reviews for a product.
     */
    async getProductReviews(req: FastifyRequest, reply: FastifyReply) {
        const { productId } = req.params as { productId: string };
        const query = reviewQuerySchema.parse(req.query);
        const result = await reviewService.getProductReviews(productId, query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Public rating summary and star distribution breakdown.
     */
    async getProductSummary(req: FastifyRequest, reply: FastifyReply) {
        const { productId } = req.params as { productId: string };
        const result = await reviewService.getProductRatingSummary(productId);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Authenticated user review history.
     */
    async getMyReviews(req: FastifyRequest, reply: FastifyReply) {
        const userId = req.user!.id;
        const query = reviewQuerySchema.parse(req.query);
        const result = await reviewService.getUserReviews(userId, query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Get review details by ID.
     */
    async getReviewById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await reviewService.getReviewById(id);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Submit an abuse/spam report on a review.
     */
    async reportReview(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const reporterId = req.user!.id;
        const input = reportReviewSchema.parse(req.body);
        const result = await reviewReportService.reportReview(id, reporterId, input);

        return reply.status(201).send({
            status: "success",
            message: "Report submitted successfully. Our moderation team will investigate.",
            data: result,
        });
    }

    /**
     * Admin: Approve or Reject a single review.
     */
    async moderateReview(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const adminId = req.user!.id;
        const input = moderateReviewSchema.parse(req.body);
        const result = await reviewModerationService.moderateReview(id, adminId, input);

        return reply.status(200).send({
            status: "success",
            message: `Review marked as ${result.status}`,
            data: result,
        });
    }

    /**
     * Admin: Bulk moderate multiple reviews.
     */
    async bulkModerateReviews(req: FastifyRequest, reply: FastifyReply) {
        const adminId = req.user!.id;
        const input = bulkModerateReviewsSchema.parse(req.body);
        const result = await reviewModerationService.bulkModerate(adminId, input);

        return reply.status(200).send({
            status: "success",
            message: `Successfully moderated ${result.affectedCount} reviews to ${result.status}`,
            data: result,
        });
    }

    /**
     * Admin: List pending reviews in the moderation queue.
     */
    async getModerationQueue(req: FastifyRequest, reply: FastifyReply) {
        const query = reviewQuerySchema.parse(req.query);
        const result = await reviewModerationService.getPendingModerationQueue(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: List all platform reviews with full status filtering.
     */
    async listAllReviews(req: FastifyRequest, reply: FastifyReply) {
        const query = reviewQuerySchema.parse(req.query);
        const result = await reviewService.listAllReviews(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: List all abuse reports.
     */
    async listReports(req: FastifyRequest, reply: FastifyReply) {
        const query = reviewReportQuerySchema.parse(req.query);
        const result = await reviewReportService.listReports(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Get report details by ID.
     */
    async getReportById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await reviewReportService.getReportById(id);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Admin: Resolve an abuse report and take action.
     */
    async resolveReport(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const adminId = req.user!.id;
        const input = resolveReportSchema.parse(req.body);
        const result = await reviewReportService.resolveReport(id, adminId, input);

        return reply.status(200).send({
            status: "success",
            message: "Report resolved successfully",
            data: result,
        });
    }
}

export const reviewController = new ReviewController();
