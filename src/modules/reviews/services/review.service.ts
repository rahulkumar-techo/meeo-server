import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { deleteFromImageKit } from "@/lib/imagekit.js";
import { VerifiedPurchaseService } from "./verifiedPurchase.service.js";
import { reviewQueryService } from "./reviewQuery.service.js";
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

        const imagesData = input.images?.map((img, index) => {
            if (typeof img === "string") {
                return { url: img, sortOrder: index };
            }
            return {
                url: img.url,
                fileId: img.fileId ?? null,
                thumbnailUrl: img.thumbnailUrl ?? null,
                altText: img.altText ?? null,
                sortOrder: img.sortOrder ?? index,
            };
        }) ?? [];

        return prisma.review.create({
            data: {
                userId,
                productId: input.productId,
                rating: input.rating,
                title: input.title ?? null,
                content: input.content ?? null,
                isVerifiedPurchase,
                status: "PENDING",
                ...(imagesData.length > 0 ? { images: { create: imagesData } } : {}),
            },
            include: {
                images: { orderBy: { sortOrder: "asc" } },
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

        if (input.images !== undefined) {
            await prisma.image.deleteMany({
                where: { reviewId },
            });
            const imagesData = input.images.map((img, index) => {
                if (typeof img === "string") {
                    return { url: img, sortOrder: index };
                }
                return {
                    url: img.url,
                    fileId: img.fileId ?? null,
                    thumbnailUrl: img.thumbnailUrl ?? null,
                    altText: img.altText ?? null,
                    sortOrder: img.sortOrder ?? index,
                };
            });
            if (imagesData.length > 0) {
                updateData.images = {
                    create: imagesData,
                };
            }
        }

        return prisma.review.update({
            where: { id: reviewId },
            data: updateData,
            include: {
                images: { orderBy: { sortOrder: "asc" } },
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
            include: { images: true },
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        if (!isAdmin && review.userId !== userId) {
            throw new AppError("You can only delete your own reviews", 403);
        }

        for (const img of review.images) {
            if (img.fileId) {
                await deleteFromImageKit(img.fileId);
            }
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
                images: { orderBy: { sortOrder: "asc" } },
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
                    images: { orderBy: { sortOrder: "asc" } },
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
        return reviewQueryService.getProductRatingSummary(productId);
    }

    /**
     * Get review history written by a specific user.
     */
    async getUserReviews(userId: string, query: ReviewQueryInput) {
        return reviewQueryService.getUserReviews(userId, query);
    }

    /**
     * Admin query for all reviews across the platform with filtering by status, product, rating, etc.
     */
    async listAllReviews(query: ReviewQueryInput) {
        return reviewQueryService.listAllReviews(query);
    }
}

export const reviewService = new ReviewService();
