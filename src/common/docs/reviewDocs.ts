/**
 * Swagger documentation schemas and tags for Reviews & Ratings endpoints.
 */
export const reviewTags = [
    {
        name: "Reviews & Ratings",
        description: "⭐ 1-5 Star Product Ratings, Customer Reviews, Verified Purchase Badges, Abuse Reporting, and Admin Moderation",
    },
];

export const reviewSwaggerSchemas = {
    createReview: {
        type: "object",
        required: ["productId", "rating"],
        properties: {
            productId: { type: "string", format: "uuid", description: "Target product ID" },
            rating: { type: "integer", minimum: 1, maximum: 5, description: "Star rating between 1 and 5" },
            title: { type: "string", maxLength: 150, description: "Review summary title" },
            content: { type: "string", maxLength: 2000, description: "Detailed customer feedback" },
            images: {
                type: "array",
                maxItems: 5,
                items: { type: "string", format: "uri" },
                description: "Attached photo URLs demonstrating product experience",
            },
        },
    },

    updateReview: {
        type: "object",
        properties: {
            rating: { type: "integer", minimum: 1, maximum: 5 },
            title: { type: "string", maxLength: 150, nullable: true },
            content: { type: "string", maxLength: 2000, nullable: true },
            images: {
                type: "array",
                maxItems: 5,
                items: { type: "string", format: "uri" },
            },
        },
    },

    reviewQuery: {
        type: "object",
        properties: {
            productId: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
            rating: { type: "integer", minimum: 1, maximum: 5 },
            isVerifiedPurchase: { type: "boolean" },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
            sortBy: { type: "string", enum: ["createdAt", "rating"], default: "createdAt" },
            sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc" },
        },
    },

    moderateReview: {
        type: "object",
        required: ["status"],
        properties: {
            status: { type: "string", enum: ["APPROVED", "REJECTED"] },
            moderationNote: { type: "string", maxLength: 500, description: "Audit explanation for approval or rejection" },
        },
    },

    bulkModerate: {
        type: "object",
        required: ["reviewIds", "status"],
        properties: {
            reviewIds: {
                type: "array",
                minItems: 1,
                maxItems: 100,
                items: { type: "string", format: "uuid" },
            },
            status: { type: "string", enum: ["APPROVED", "REJECTED"] },
            moderationNote: { type: "string", maxLength: 500 },
        },
    },

    reportReview: {
        type: "object",
        required: ["reason"],
        properties: {
            reason: {
                type: "string",
                enum: ["SPAM", "HARASSMENT", "INAPPROPRIATE", "FAKE_REVIEW", "OFF_TOPIC", "OTHER"],
                description: "Category of abuse or policy violation",
            },
            details: { type: "string", maxLength: 1000, description: "Additional context on the violation" },
        },
    },

    reportQuery: {
        type: "object",
        properties: {
            reviewId: { type: "string", format: "uuid" },
            reporterId: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["PENDING", "REVIEWED", "DISMISSED", "ACTIONED"] },
            reason: { type: "string", enum: ["SPAM", "HARASSMENT", "INAPPROPRIATE", "FAKE_REVIEW", "OFF_TOPIC", "OTHER"] },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    resolveReport: {
        type: "object",
        required: ["status"],
        properties: {
            status: { type: "string", enum: ["REVIEWED", "DISMISSED", "ACTIONED"] },
            resolutionNote: { type: "string", maxLength: 500 },
            action: {
                type: "string",
                enum: ["APPROVE_REVIEW", "REJECT_REVIEW", "DELETE_REVIEW", "NO_ACTION"],
                default: "NO_ACTION",
            },
        },
    },
};
