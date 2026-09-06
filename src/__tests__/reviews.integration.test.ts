import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "reviews-test-jwt-secret";

const {
    reviewServiceMock,
    reviewModerationMock,
    reviewReportMock,
    authPrismaMock,
} = vi.hoisted(() => ({
    reviewServiceMock: {
        createReview: vi.fn(),
        updateReview: vi.fn(),
        deleteReview: vi.fn(),
        getReviewById: vi.fn(),
        getProductReviews: vi.fn(),
        getProductRatingSummary: vi.fn(),
        getUserReviews: vi.fn(),
        listAllReviews: vi.fn(),
    },
    reviewModerationMock: {
        moderateReview: vi.fn(),
        bulkModerate: vi.fn(),
        getPendingModerationQueue: vi.fn(),
    },
    reviewReportMock: {
        reportReview: vi.fn(),
        listReports: vi.fn(),
        getReportById: vi.fn(),
        resolveReport: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/reviews/services/review.service.js", () => ({
    reviewService: reviewServiceMock,
}));
vi.mock("../modules/reviews/services/reviewModeration.service.js", () => ({
    reviewModerationService: reviewModerationMock,
}));
vi.mock("../modules/reviews/services/reviewReport.service.js", () => ({
    reviewReportService: reviewReportMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import reviewRouter from "../modules/reviews/routes/review.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Reviews & Ratings HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(reviewRouter, { prefix: "/api/reviews" });
        return app;
    };

    const mockCustomerUser = () => {
        const userId = "c5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "shopper@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "shopper@test.com",
        });

        return { token, userId };
    };

    const mockAdminUser = () => {
        const userId = "admin-uuid-1111-2222-333344445555";
        const sessionId = "session-admin-uuid-1111-2222";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.REVIEW_READ } },
                            { permission: { name: PERMISSIONS.REVIEW_MODERATE } },
                            { permission: { name: PERMISSIONS.REVIEW_DELETE } },
                        ],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "admin@store.com",
        });

        return { token, userId };
    };

    it("publicly retrieves approved product reviews via GET /api/reviews/products/:productId", async () => {
        const app = await createTestApp();
        const productId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

        reviewServiceMock.getProductReviews.mockResolvedValue({
            summary: {
                productId,
                averageRating: 4.5,
                totalReviews: 10,
                verifiedPurchaseCount: 8,
                starDistribution: { 1: 0, 2: 1, 3: 0, 4: 3, 5: 6 },
            },
            items: [
                {
                    id: "rev-1",
                    rating: 5,
                    title: "Excellent sound quality",
                    content: "Bass is crisp and clear",
                    isVerifiedPurchase: true,
                },
            ],
            pagination: { page: 1, limit: 20, total: 10, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: `/api/reviews/products/${productId}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.summary.averageRating).toBe(4.5);
        expect(body.data.items).toHaveLength(1);
    });

    it("publicly retrieves rating summary via GET /api/reviews/products/:productId/summary", async () => {
        const app = await createTestApp();
        const productId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

        reviewServiceMock.getProductRatingSummary.mockResolvedValue({
            productId,
            averageRating: 4.8,
            totalReviews: 25,
            verifiedPurchaseCount: 22,
            starDistribution: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 21 },
        });

        const response = await app.inject({
            method: "GET",
            url: `/api/reviews/products/${productId}/summary`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.averageRating).toBe(4.8);
        expect(body.data.verifiedPurchaseCount).toBe(22);
    });

    it("submits a review as authenticated customer via POST /api/reviews", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();
        const productId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

        reviewServiceMock.createReview.mockResolvedValue({
            id: "rev-new-1",
            userId,
            productId,
            rating: 5,
            title: "Superb product",
            content: "Worth every penny",
            isVerifiedPurchase: true,
            status: "PENDING",
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/reviews",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                productId,
                rating: 5,
                title: "Superb product",
                content: "Worth every penny",
            },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.status).toBe("PENDING");
        expect(reviewServiceMock.createReview).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ productId, rating: 5 }),
        );
    });

    it("updates existing review via PUT /api/reviews/:id", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();
        const reviewId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        reviewServiceMock.updateReview.mockResolvedValue({
            id: reviewId,
            rating: 4,
            title: "Updated title",
            status: "PENDING",
        });

        const response = await app.inject({
            method: "PUT",
            url: `/api/reviews/${reviewId}`,
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                rating: 4,
                title: "Updated title",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(reviewServiceMock.updateReview).toHaveBeenCalledWith(
            reviewId,
            userId,
            expect.objectContaining({ rating: 4, title: "Updated title" }),
        );
    });

    it("submits an abuse report on a review via POST /api/reviews/:id/report", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();
        const reviewId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        reviewReportMock.reportReview.mockResolvedValue({
            id: "rep-1",
            reviewId,
            reporterId: userId,
            reason: "SPAM",
            status: "PENDING",
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/reviews/${reviewId}/report`,
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                reason: "SPAM",
                details: "Promotional links in review",
            },
        });

        expect(response.statusCode).toBe(201);
        expect(reviewReportMock.reportReview).toHaveBeenCalledWith(
            reviewId,
            userId,
            expect.objectContaining({ reason: "SPAM" }),
        );
    });

    it("admin lists moderation queue via GET /api/reviews/admin/queue", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        reviewModerationMock.getPendingModerationQueue.mockResolvedValue({
            items: [
                { id: "rev-pending-1", rating: 5, status: "PENDING" },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/reviews/admin/queue",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.items).toHaveLength(1);
    });

    it("admin moderates a single review via PATCH /api/reviews/admin/:id/moderate", async () => {
        const app = await createTestApp();
        const { token, userId } = mockAdminUser();
        const reviewId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        reviewModerationMock.moderateReview.mockResolvedValue({
            id: reviewId,
            status: "APPROVED",
            moderatedBy: userId,
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/reviews/admin/${reviewId}/moderate`,
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                status: "APPROVED",
                moderationNote: "Verified authentic customer feedback",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(reviewModerationMock.moderateReview).toHaveBeenCalledWith(
            reviewId,
            userId,
            expect.objectContaining({ status: "APPROVED" }),
        );
    });

    it("admin bulk moderates reviews via POST /api/reviews/admin/bulk-moderate", async () => {
        const app = await createTestApp();
        const { token, userId } = mockAdminUser();
        const rev1 = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const rev2 = "e5033c46-95e3-4d22-b5e1-0bfab4b901a2";

        reviewModerationMock.bulkModerate.mockResolvedValue({
            status: "APPROVED",
            affectedCount: 2,
            requestedCount: 2,
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/reviews/admin/bulk-moderate",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                reviewIds: [rev1, rev2],
                status: "APPROVED",
                moderationNote: "Batch approved",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(reviewModerationMock.bulkModerate).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ reviewIds: [rev1, rev2], status: "APPROVED" }),
        );
    });

    it("admin resolves abuse report via PATCH /api/reviews/admin/reports/:id/resolve", async () => {
        const app = await createTestApp();
        const { token, userId } = mockAdminUser();
        const reportId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        reviewReportMock.resolveReport.mockResolvedValue({
            id: reportId,
            status: "ACTIONED",
            reviewActionExecuted: "Review rejected",
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/reviews/admin/reports/${reportId}/resolve`,
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                status: "ACTIONED",
                action: "REJECT_REVIEW",
                resolutionNote: "Spam confirmed",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(reviewReportMock.resolveReport).toHaveBeenCalledWith(
            reportId,
            userId,
            expect.objectContaining({ status: "ACTIONED", action: "REJECT_REVIEW" }),
        );
    });
});
