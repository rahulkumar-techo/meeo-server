import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type {
    ModerateReviewInput,
    BulkModerateReviewsInput,
    ReviewQueryInput,
} from "../validations/review.validation.js";

export class ReviewModerationService {
    /**
     * Moderates an individual review (Approve / Reject) with admin audit trails.
     */
    async moderateReview(reviewId: string, adminId: string, input: ModerateReviewInput) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        return prisma.review.update({
            where: { id: reviewId },
            data: {
                status: input.status,
                moderatedBy: adminId,
                moderatedAt: new Date(),
                moderationNote: input.moderationNote ?? null,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                product: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
        });
    }

    /**
     * Bulk moderate a batch of reviews in a single operation.
     */
    async bulkModerate(adminId: string, input: BulkModerateReviewsInput) {
        const { reviewIds, status, moderationNote } = input;

        const updateResult = await prisma.review.updateMany({
            where: {
                id: { in: reviewIds },
            },
            data: {
                status,
                moderatedBy: adminId,
                moderatedAt: new Date(),
                moderationNote: moderationNote ?? null,
            },
        });

        return {
            status,
            affectedCount: updateResult.count,
            requestedCount: reviewIds.length,
            moderatedBy: adminId,
            moderatedAt: new Date(),
        };
    }

    /**
     * Lists reviews waiting in the moderation queue (PENDING).
     */
    async getPendingModerationQueue(query: ReviewQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {
            status: "PENDING",
        };

        if (query.productId) where.productId = query.productId;

        const [items, total] = await Promise.all([
            prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "asc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                    product: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    _count: {
                        select: { reports: true },
                    },
                },
            }),
            prisma.review.count({ where }),
        ]);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }
}

export const reviewModerationService = new ReviewModerationService();
