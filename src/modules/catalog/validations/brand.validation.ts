import { z } from "zod";
import { productStatusEnum, slugRegex } from "./category.validation.js";

/** Validation schema for creating a brand. */
export const createBrandSchema = z.object({
    name: z.string().trim().min(1, "Brand name is required").max(100, "Brand name cannot exceed 100 characters"),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(120, "Slug cannot exceed 120 characters").optional(),
    logoUrl: z.string().trim().url("Invalid logo URL").nullable().optional(),
    description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").nullable().optional(),
    status: productStatusEnum.optional().default("ACTIVE"),
}).strict();

/** Validation schema for updating a brand. */
export const updateBrandSchema = z.object({
    name: z.string().trim().min(1, "Brand name cannot be empty").max(100, "Brand name cannot exceed 100 characters").optional(),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(120, "Slug cannot exceed 120 characters").optional(),
    logoUrl: z.string().trim().url("Invalid logo URL").nullable().optional(),
    description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").nullable().optional(),
    status: productStatusEnum.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});

/** Validation schema for querying brands. */
export const brandQuerySchema = z.object({
    search: z.string().trim().optional(),
    status: productStatusEnum.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["name", "createdAt", "updatedAt"]).optional().default("name"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type BrandQueryInput = z.infer<typeof brandQuerySchema>;
