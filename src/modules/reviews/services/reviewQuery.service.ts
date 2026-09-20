import { prisma } from "@/lib/prisma.js";
import type { ReviewQueryInput } from "../validations/review.validation.js";

export class ReviewQueryService {
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
