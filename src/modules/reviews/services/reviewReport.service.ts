import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type {
    ReportReviewInput,
    ReviewReportQueryInput,
    ResolveReportInput,
} from "../validations/review.validation.js";

export class ReviewReportService {
    /**
     * Submit an abuse/spam report on a review.
     */
    async reportReview(reviewId: string, reporterId: string, input: ReportReviewInput) {
        const review = await prisma.review.findUnique({
            where: { id: reviewId },
        });

        if (!review) {
            throw new AppError("Review not found", 404);
        }

        if (review.userId === reporterId) {
            throw new AppError("You cannot report your own review", 400);
        }

        const existingReport = await prisma.reviewReport.findUnique({
            where: {
                reviewId_reporterId: {
                    reviewId,
                    reporterId,
                },
            },
        });

        if (existingReport) {
            throw new AppError("You have already reported this review", 409);
        }

        return prisma.reviewReport.create({
            data: {
                reviewId,
                reporterId,
                reason: input.reason,
                details: input.details ?? null,
                status: "PENDING",
            },
            include: {
                review: {
                    select: {
                        id: true,
                        rating: true,
                        title: true,
                        content: true,
                        status: true,
                    },
                },
            },
        });
    }

    /**
     * List all review reports for admin moderation.
     */
    async listReports(query: ReviewReportQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.reviewId) where.reviewId = query.reviewId;
        if (query.reporterId) where.reporterId = query.reporterId;
        if (query.status) where.status = query.status;
        if (query.reason) where.reason = query.reason;

        const [items, total] = await Promise.all([
            prisma.reviewReport.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    reporter: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                    review: {
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
                    },
                },
            }),
            prisma.reviewReport.count({ where }),
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
     * Retrieve single review report details.
     */
    async getReportById(reportId: string) {
        const report = await prisma.reviewReport.findUnique({
            where: { id: reportId },
            include: {
                reporter: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                review: {
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
                },
            },
        });

        if (!report) {
            throw new AppError("Review report not found", 404);
        }

        return report;
    }

    /**
     * Resolve an abuse report and optionally enact an action on the associated review.
     */
    async resolveReport(reportId: string, adminId: string, input: ResolveReportInput) {
        const report = await prisma.reviewReport.findUnique({
            where: { id: reportId },
        });

        if (!report) {
            throw new AppError("Review report not found", 404);
        }

        // Execute optional associated review action
        let reviewActionExecuted: string | null = null;
        if (input.action === "REJECT_REVIEW") {
            await prisma.review.update({
                where: { id: report.reviewId },
                data: {
                    status: "REJECTED",
                    moderatedBy: adminId,
                    moderatedAt: new Date(),
                    moderationNote: `Rejected via report resolution #${reportId}: ${input.resolutionNote ?? "Policy violation"}`,
                },
            });
            reviewActionExecuted = "Review rejected";
        } else if (input.action === "APPROVE_REVIEW") {
            await prisma.review.update({
                where: { id: report.reviewId },
                data: {
                    status: "APPROVED",
                    moderatedBy: adminId,
                    moderatedAt: new Date(),
                    moderationNote: `Approved via report resolution #${reportId}`,
                },
            });
            reviewActionExecuted = "Review approved";
        } else if (input.action === "DELETE_REVIEW") {
            await prisma.review.delete({
                where: { id: report.reviewId },
            });
            reviewActionExecuted = "Review permanently deleted";
        }

        // If review was deleted, report was cascade-deleted, or if not deleted, update report status
        if (input.action === "DELETE_REVIEW") {
            return {
                id: reportId,
                status: input.status,
                action: input.action,
                reviewActionExecuted,
                message: "Report processed and target review was deleted",
            };
        }

        const updatedReport = await prisma.reviewReport.update({
            where: { id: reportId },
            data: {
                status: input.status,
                resolvedBy: adminId,
                resolvedAt: new Date(),
                resolutionNote: input.resolutionNote ?? null,
            },
            include: {
                review: true,
            },
        });

        return {
            ...updatedReport,
            reviewActionExecuted,
        };
    }
}

export const reviewReportService = new ReviewReportService();
