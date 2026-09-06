import { z } from "zod";

/**
 * Validation schema for creating a new product rating & review.
 */
export const createReviewSchema = z.object({
    productId: z.string().uuid("Invalid product ID format"),
    rating: z.coerce
        .number()
        .int("Rating must be an integer")
        .min(1, "Rating must be at least 1 star")
        .max(5, "Rating cannot exceed 5 stars"),
    title: z.string().trim().max(150, "Review title cannot exceed 150 characters").optional().nullable(),
    content: z.string().trim().max(2000, "Review content cannot exceed 2000 characters").optional().nullable(),
    images: z
        .array(z.string().url("Each review image must be a valid URL"))
        .max(5, "Cannot attach more than 5 images per review")
        .default([]),
});

/**
 * Validation schema for updating a customer's review.
 */
export const updateReviewSchema = z.object({
    rating: z.coerce
        .number()
        .int("Rating must be an integer")
        .min(1, "Rating must be at least 1 star")
        .max(5, "Rating cannot exceed 5 stars")
        .optional(),
    title: z.string().trim().max(150, "Review title cannot exceed 150 characters").optional().nullable(),
    content: z.string().trim().max(2000, "Review content cannot exceed 2000 characters").optional().nullable(),
    images: z
        .array(z.string().url("Each review image must be a valid URL"))
        .max(5, "Cannot attach more than 5 images per review")
        .optional(),
});

/**
 * Validation schema for querying public reviews on a product or admin listings.
 */
export const reviewQuerySchema = z.object({
    productId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    isVerifiedPurchase: z
        .preprocess((val) => {
            if (typeof val === "string") return val.toLowerCase() === "true";
            return val;
        }, z.boolean())
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(["createdAt", "rating"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Validation schema for admin moderation of a single review.
 */
export const moderateReviewSchema = z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    moderationNote: z.string().trim().max(500, "Moderation note cannot exceed 500 characters").optional().nullable(),
});

/**
 * Validation schema for bulk review moderation by admins.
 */
export const bulkModerateReviewsSchema = z.object({
    reviewIds: z.array(z.string().uuid("Invalid review ID")).min(1, "At least one review ID is required").max(100, "Cannot bulk moderate more than 100 reviews at once"),
    status: z.enum(["APPROVED", "REJECTED"]),
    moderationNote: z.string().trim().max(500, "Moderation note cannot exceed 500 characters").optional().nullable(),
});

/**
 * Validation schema for reporting a review for spam, abuse, or violation.
 */
export const reportReviewSchema = z.object({
    reason: z.enum(["SPAM", "HARASSMENT", "INAPPROPRIATE", "FAKE_REVIEW", "OFF_TOPIC", "OTHER"]),
    details: z.string().trim().max(1000, "Details cannot exceed 1000 characters").optional().nullable(),
});

/**
 * Validation schema for querying abuse reports by admins.
 */
export const reviewReportQuerySchema = z.object({
    reviewId: z.string().uuid().optional(),
    reporterId: z.string().uuid().optional(),
    status: z.enum(["PENDING", "REVIEWED", "DISMISSED", "ACTIONED"]).optional(),
    reason: z.enum(["SPAM", "HARASSMENT", "INAPPROPRIATE", "FAKE_REVIEW", "OFF_TOPIC", "OTHER"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Validation schema for admin resolving an abuse report.
 */
export const resolveReportSchema = z.object({
    status: z.enum(["REVIEWED", "DISMISSED", "ACTIONED"]),
    resolutionNote: z.string().trim().max(500, "Resolution note cannot exceed 500 characters").optional().nullable(),
    action: z.enum(["APPROVE_REVIEW", "REJECT_REVIEW", "DELETE_REVIEW", "NO_ACTION"]).optional().default("NO_ACTION"),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewQueryInput = z.infer<typeof reviewQuerySchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
export type BulkModerateReviewsInput = z.infer<typeof bulkModerateReviewsSchema>;
export type ReportReviewInput = z.infer<typeof reportReviewSchema>;
export type ReviewReportQueryInput = z.infer<typeof reviewReportQuerySchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
