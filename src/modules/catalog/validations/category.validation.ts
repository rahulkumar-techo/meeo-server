import { z } from "zod";

/** Regular expression for URL-friendly kebab-case slugs. */
export const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Status enum matching Prisma's ProductStatus. */
export const productStatusEnum = z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]);

/** Validation schema for creating a new category. */
export const createCategorySchema = z.object({
    name: z.string().trim().min(1, "Category name is required").max(100, "Category name cannot exceed 100 characters"),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(120, "Slug cannot exceed 120 characters").optional(),
    parentId: z.string().uuid("Invalid parent category ID").nullable().optional(),
    description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").nullable().optional(),
    imageUrl: z.string().trim().url("Invalid image URL").nullable().optional(),
    status: productStatusEnum.optional().default("ACTIVE"),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer").optional().default(0),
}).strict();

/** Validation schema for updating an existing category. */
export const updateCategorySchema = z.object({
    name: z.string().trim().min(1, "Category name cannot be empty").max(100, "Category name cannot exceed 100 characters").optional(),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(120, "Slug cannot exceed 120 characters").optional(),
    parentId: z.string().uuid("Invalid parent category ID").nullable().optional(),
    description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").nullable().optional(),
    imageUrl: z.string().trim().url("Invalid image URL").nullable().optional(),
    status: productStatusEnum.optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer").optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});

/** Validation schema for querying/listing categories. */
export const categoryQuerySchema = z.object({
    search: z.string().trim().optional(),
    parentId: z.union([z.string().uuid(), z.literal("null"), z.literal("root")]).optional(),
    status: productStatusEnum.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["name", "sortOrder", "createdAt", "updatedAt"]).optional().default("sortOrder"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryQueryInput = z.infer<typeof categoryQuerySchema>;
