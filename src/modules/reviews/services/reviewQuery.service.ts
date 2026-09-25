import { prisma } from "@/lib/prisma.js";
import type { ReviewQueryInput } from "../validations/review.validation.js";

export class ReviewQueryService {
    /**
     * Aggregates average rating, total count, and star distribution breakdown (1-5 stars).
     */
    async getProductRatingSummary(productId: string) {
        // fix:expensive computations - Run SQL-level aggregation and groupBy instead of fetching all reviews into Node.js memory
        const [ratingAgg, distributionGroups, verifiedPurchaseCount] = await Promise.all([
            prisma.review.aggregate({
                where: {
                    productId,
                    status: "APPROVED",
                },
                _avg: { rating: true },
                _count: { _all: true },
            }),
            prisma.review.groupBy({
                by: ["rating"],
                where: {
                    productId,
                    status: "APPROVED",
                },
                _count: { _all: true },
            }),
            prisma.review.count({
                where: {
                    productId,
                    status: "APPROVED",
                    isVerifiedPurchase: true,
                },
            }),
        ]);

        const totalReviews = ratingAgg._count._all;
        const averageRating = ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : 0;

        const distribution: Record<number, number> = {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 0,
        };

        for (const g of distributionGroups) {
            if (g.rating in distribution) {
                distribution[g.rating] = g._count._all;
            }
        }

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
                    images: { orderBy: { sortOrder: "asc" } },
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
                    images: { orderBy: { sortOrder: "asc" } },
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

export const reviewQueryService = new ReviewQueryService();
