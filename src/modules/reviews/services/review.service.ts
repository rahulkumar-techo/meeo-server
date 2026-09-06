import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { VerifiedPurchaseService } from "./verifiedPurchase.service.js";
import type {
    CreateReviewInput,
    UpdateReviewInput,
    ReviewQueryInput,
} from "../validations/review.validation.js";

export class ReviewService {
    /**
     * Submit a new rating and review for a product.
     * Checks product existence, verifies if already reviewed, and tags verified purchase status.
     */
    async createReview(userId: string, input: CreateReviewInput) {
        const product = await prisma.product.findUnique({
            where: { id: input.productId },
            select: { id: true, name: true },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        const existingReview = await prisma.review.findUnique({
            where: {
                userId_productId: {
                    userId,
                    productId: input.productId,
                },
            },
        });

        if (existingReview) {
            throw new AppError("You have already reviewed this product. You can update your existing review.", 409);
        }

        const isVerifiedPurchase = await VerifiedPurchaseService.checkVerifiedPurchase(
            userId,
            input.productId,
        );

        return prisma.review.create({
            data: {
                userId,
                productId: input.productId,
                rating: input.rating,
                title: input.title ?? null,
                content: input.content ?? null,
                images: input.images ?? [],
                isVerifiedPurchase,
                status: "PENDING",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
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
     * Update an existing review. Resets moderation status to PENDING.
     */
    async updateReview(reviewId: string, userId: string, input: UpdateReviewInput) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        if (review.userId !== userId) {
            throw new AppError("You can only modify your own reviews", 403);
        }

        const isVerifiedPurchase = await VerifiedPurchaseService.checkVerifiedPurchase(
            userId,
            review.productId,
        );

        const updateData: any = {
            status: "PENDING",
            isVerifiedPurchase,
            moderatedBy: null,
            moderatedAt: null,
            moderationNote: null,
        };

        if (input.rating !== undefined) updateData.rating = input.rating;
        if (input.title !== undefined) updateData.title = input.title;
        if (input.content !== undefined) updateData.content = input.content;
        if (input.images !== undefined) updateData.images = input.images;

        return prisma.review.update({
            where: { id: reviewId },
            data: updateData,
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
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
     * Delete a review by owner or admin.
     */
    async deleteReview(reviewId: string, userId: string, isAdmin: boolean = false) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        if (!isAdmin && review.userId !== userId) {
            throw new AppError("You can only delete your own reviews", 403);
        }

        await prisma.review.delete({
            where: { id: reviewId },
        });

        return { deleted: true, id: reviewId, message: "Review deleted successfully" };
    }

    /**
     * Get review by ID.
     */
    async getReviewById(reviewId: string) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
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
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        return review;
    }

    /**
     * Public feed of approved reviews for a product with pagination, filtering, and summary metrics.
     */
    async getProductReviews(productId: string, query: ReviewQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {
            productId,
            status: "APPROVED",
        };

        if (query.rating) {
            where.rating = query.rating;
        }

        if (query.isVerifiedPurchase !== undefined) {
            where.isVerifiedPurchase = query.isVerifiedPurchase;
        }

        const orderBy: any = {};
        if (query.sortBy === "rating") {
            orderBy.rating = query.sortOrder;
        } else {
            orderBy.createdAt = query.sortOrder;
        }

        const [items, total, summary] = await Promise.all([
            prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            avatarUrl: true,
                        },
                    },
                },
            }),
            prisma.review.count({ where }),
            this.getProductRatingSummary(productId),
        ]);

        return {
            summary,
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        };
    }

    /**
     * Aggregates average rating, total count, and star distribution breakdown (1-5 stars).
     */
    async getProductRatingSummary(productId: string) {
        const approvedReviews = await prisma.review.findMany({
            where: {
                productId,
                status: "APPROVED",
            },
            select: {
                rating: true,
                isVerifiedPurchase: true,
            },
        });

        const totalReviews = approvedReviews.length;
        const distribution: Record<number, number> = {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
        };

        let verifiedPurchaseCount = 0;
        let sumRating = 0;

        for (const r of approvedReviews) {
            sumRating += r.rating;
            if (r.rating in distribution) {
                distribution[r.rating] = (distribution[r.rating] || 0) + 1;
            }
            if (r.isVerifiedPurchase) {
                verifiedPurchaseCount++;
            }
        }

        const averageRating = totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

        return {
            productId,
            averageRating,
            totalReviews,
            verifiedPurchaseCount,
            starDistribution: distribution,
        };
    }

    /**
     * Get review history written by a specific user.
     */
    async getUserReviews(userId: string, query: ReviewQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = { userId };
        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            images: true,
                        },
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

    /**
     * Admin query for all reviews across the platform with filtering by status, product, rating, etc.
     */
    async listAllReviews(query: ReviewQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.productId) where.productId = query.productId;
        if (query.userId) where.userId = query.userId;
        if (query.status) where.status = query.status;
        if (query.rating) where.rating = query.rating;
        if (query.isVerifiedPurchase !== undefined) where.isVerifiedPurchase = query.isVerifiedPurchase;

        const [items, total] = await Promise.all([
            prisma.review.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
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

export const reviewService = new ReviewService();
