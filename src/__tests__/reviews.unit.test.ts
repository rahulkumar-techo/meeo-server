import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReviewService } from "@/modules/reviews/services/review.service.js";
import { ReviewModerationService } from "@/modules/reviews/services/reviewModeration.service.js";
import { ReviewReportService } from "@/modules/reviews/services/reviewReport.service.js";
import { VerifiedPurchaseService } from "@/modules/reviews/services/verifiedPurchase.service.js";
import { prisma } from "@/lib/prisma.js";

vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        product: {
            findUnique: vi.fn(),
        },
        orderItem: {
            findFirst: vi.fn(),
        },
        review: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        reviewReport: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
    },
}));

describe("Reviews & Ratings Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("VerifiedPurchaseService", () => {
        it("returns true when customer has a valid confirmed/fulfilled order for the product", async () => {
            vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({ id: "item-1" } as any);

            const result = await VerifiedPurchaseService.checkVerifiedPurchase("user-1", "prod-1");
            expect(result).toBe(true);
            expect(prisma.orderItem.findFirst).toHaveBeenCalledWith({
                where: {
                    productId: "prod-1",
                    order: {
                        userId: "user-1",
                        status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
                    },
                },
                select: { id: true },
            });
        });

        it("returns false when customer has never purchased the product", async () => {
            vi.mocked(prisma.orderItem.findFirst).mockResolvedValue(null);

            const result = await VerifiedPurchaseService.checkVerifiedPurchase("user-1", "prod-2");
            expect(result).toBe(false);
        });
    });

    describe("ReviewService", () => {
        const reviewService = new ReviewService();

        it("throws 404 if product does not exist", async () => {
            vi.mocked(prisma.product.findUnique).mockResolvedValue(null);

            await expect(
                reviewService.createReview("u-1", {
                    productId: "p-404",
                    rating: 5,
                } as any),
            ).rejects.toThrow("Product not found");
        });

        it("throws 409 if user has already reviewed the product", async () => {
            vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: "p-1", name: "Shoes" } as any);
            vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: "rev-exist" } as any);

            await expect(
                reviewService.createReview("u-1", {
                    productId: "p-1",
                    rating: 5,
                } as any),
            ).rejects.toThrow(/already reviewed this product/);
        });

        it("creates review with PENDING status and verified purchase flag", async () => {
            vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: "p-1", name: "Shoes" } as any);
            vi.mocked(prisma.review.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({ id: "ord-item-1" } as any);
            vi.mocked(prisma.review.create).mockResolvedValue({
                id: "rev-1",
                userId: "u-1",
                productId: "p-1",
                rating: 5,
                title: "Great shoes!",
                content: "Very comfortable",
                isVerifiedPurchase: true,
                status: "PENDING",
            } as any);

            const review = await reviewService.createReview("u-1", {
                productId: "p-1",
                rating: 5,
                title: "Great shoes!",
                content: "Very comfortable",
            } as any);

            expect(review.id).toBe("rev-1");
            expect(review.isVerifiedPurchase).toBe(true);
            expect(review.status).toBe("PENDING");
            expect(prisma.review.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        rating: 5,
                        isVerifiedPurchase: true,
                        status: "PENDING",
                    }),
                }),
            );
        });

        it("updates review and resets status to PENDING", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({
                id: "rev-1",
                userId: "u-1",
                productId: "p-1",
                status: "APPROVED",
            } as any);
            vi.mocked(prisma.orderItem.findFirst).mockResolvedValue({ id: "ord-item-1" } as any);
            vi.mocked(prisma.review.update).mockResolvedValue({
                id: "rev-1",
                rating: 4,
                status: "PENDING",
            } as any);

            const updated = await reviewService.updateReview("rev-1", "u-1", { rating: 4 });
            expect(updated.rating).toBe(4);
            expect(prisma.review.update).toHaveBeenCalledWith({
                where: { id: "rev-1" },
                data: expect.objectContaining({
                    rating: 4,
                    status: "PENDING",
                    moderatedBy: null,
                }),
                include: expect.anything(),
            });
        });

        it("rejects review update if requester is not author", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({
                id: "rev-1",
                userId: "other-user",
                productId: "p-1",
            } as any);

            await expect(
                reviewService.updateReview("rev-1", "u-1", { rating: 4 }),
            ).rejects.toThrow("You can only modify your own reviews");
        });

        it("calculates product rating summary and star distribution correctly", async () => {
            vi.mocked(prisma.review.findMany).mockResolvedValue([
                { rating: 5, isVerifiedPurchase: true },
                { rating: 5, isVerifiedPurchase: false },
                { rating: 4, isVerifiedPurchase: true },
                { rating: 2, isVerifiedPurchase: true },
            ] as any);

            const summary = await reviewService.getProductRatingSummary("p-1");

            expect(summary.totalReviews).toBe(4);
            expect(summary.averageRating).toBe(4.0); // (5+5+4+2)/4 = 16/4 = 4.0
            expect(summary.verifiedPurchaseCount).toBe(3);
            expect(summary.starDistribution).toEqual({
                1: 0,
                2: 1,
                3: 0,
                4: 1,
                5: 2,
            });
        });
    });

    describe("ReviewModerationService", () => {
        const moderationService = new ReviewModerationService();

        it("moderates a single review and stores admin audit note", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({ id: "rev-1" } as any);
            vi.mocked(prisma.review.update).mockResolvedValue({
                id: "rev-1",
                status: "APPROVED",
                moderatedBy: "admin-1",
                moderationNote: "Looks verified and polite",
            } as any);

            const result = await moderationService.moderateReview("rev-1", "admin-1", {
                status: "APPROVED",
                moderationNote: "Looks verified and polite",
            });

            expect(result.status).toBe("APPROVED");
            expect(prisma.review.update).toHaveBeenCalledWith({
                where: { id: "rev-1" },
                data: expect.objectContaining({
                    status: "APPROVED",
                    moderatedBy: "admin-1",
                    moderationNote: "Looks verified and polite",
                }),
                include: expect.anything(),
            });
        });

        it("bulk moderates multiple reviews simultaneously", async () => {
            vi.mocked(prisma.review.updateMany).mockResolvedValue({ count: 3 });

            const result = await moderationService.bulkModerate("admin-1", {
                reviewIds: ["rev-1", "rev-2", "rev-3"],
                status: "REJECTED",
                moderationNote: "Spam wave",
            });

            expect(result.affectedCount).toBe(3);
            expect(result.status).toBe("REJECTED");
            expect(prisma.review.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ["rev-1", "rev-2", "rev-3"] } },
                data: expect.objectContaining({
                    status: "REJECTED",
                    moderatedBy: "admin-1",
                    moderationNote: "Spam wave",
                }),
            });
        });
    });

    describe("ReviewReportService", () => {
        const reportService = new ReviewReportService();

        it("prevents customer from reporting their own review", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({
                id: "rev-1",
                userId: "user-author",
            } as any);

            await expect(
                reportService.reportReview("rev-1", "user-author", { reason: "SPAM" }),
            ).rejects.toThrow("You cannot report your own review");
        });

        it("prevents duplicate reporting of the same review by same user", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({
                id: "rev-1",
                userId: "user-author",
            } as any);
            vi.mocked(prisma.reviewReport.findUnique).mockResolvedValue({ id: "rep-exist" } as any);

            await expect(
                reportService.reportReview("rev-1", "user-other", { reason: "SPAM" }),
            ).rejects.toThrow("You have already reported this review");
        });

        it("submits abuse report successfully", async () => {
            vi.mocked(prisma.review.findUnique).mockResolvedValue({
                id: "rev-1",
                userId: "user-author",
            } as any);
            vi.mocked(prisma.reviewReport.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.reviewReport.create).mockResolvedValue({
                id: "rep-1",
                reviewId: "rev-1",
                reporterId: "user-reporter",
                reason: "FAKE_REVIEW",
                status: "PENDING",
            } as any);

            const report = await reportService.reportReview("rev-1", "user-reporter", {
                reason: "FAKE_REVIEW",
                details: "Suspicious bot account",
            });

            expect(report.id).toBe("rep-1");
            expect(report.reason).toBe("FAKE_REVIEW");
        });

        it("resolves report with REJECT_REVIEW action", async () => {
            vi.mocked(prisma.reviewReport.findUnique).mockResolvedValue({
                id: "rep-1",
                reviewId: "rev-1",
            } as any);
            vi.mocked(prisma.review.update).mockResolvedValue({ id: "rev-1", status: "REJECTED" } as any);
            vi.mocked(prisma.reviewReport.update).mockResolvedValue({
                id: "rep-1",
                status: "ACTIONED",
                resolutionNote: "Review violated spam policy",
            } as any);

            const resolved = await reportService.resolveReport("rep-1", "admin-1", {
                status: "ACTIONED",
                action: "REJECT_REVIEW",
                resolutionNote: "Review violated spam policy",
            });

            expect(resolved.status).toBe("ACTIONED");
            expect(resolved.reviewActionExecuted).toBe("Review rejected");
            expect(prisma.review.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "rev-1" },
                    data: expect.objectContaining({ status: "REJECTED" }),
                }),
            );
        });
    });
});
