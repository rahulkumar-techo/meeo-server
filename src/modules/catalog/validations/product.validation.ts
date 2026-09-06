import { z } from "zod";
import { productStatusEnum, slugRegex } from "./category.validation.js";

/** Validation schema for an image item attached to a product. */
export const productImageInputSchema = z.object({
    fileId: z.string().trim().optional().nullable(),
    url: z.string().trim().url("Invalid image URL"),
    altText: z.string().trim().max(200, "Alt text cannot exceed 200 characters").nullable().optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer").optional().default(0),
});

/** Validation schema for creating a product. */
export const createProductSchema = z.object({
    name: z.string().trim().min(1, "Product name is required").max(200, "Product name cannot exceed 200 characters"),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(220, "Slug cannot exceed 220 characters").optional(),
    description: z.string().trim().max(10000, "Description cannot exceed 10,000 characters").nullable().optional(),
    categoryId: z.string().uuid("Invalid category ID").nullable().optional(),
    brandId: z.string().uuid("Invalid brand ID").nullable().optional(),
    status: productStatusEnum.optional().default("DRAFT"),
    isFeatured: z.boolean().optional().default(false),
    seoTitle: z.string().trim().max(70, "SEO title should not exceed 70 characters").nullable().optional(),
    seoDescription: z.string().trim().max(160, "SEO description should not exceed 160 characters").nullable().optional(),
    images: z.array(productImageInputSchema).optional().default([]),
}).strict();

/** Validation schema for updating a product. */
export const updateProductSchema = z.object({
    name: z.string().trim().min(1, "Product name cannot be empty").max(200, "Product name cannot exceed 200 characters").optional(),
    slug: z.string().trim().regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens").max(220, "Slug cannot exceed 220 characters").optional(),
    description: z.string().trim().max(10000, "Description cannot exceed 10,000 characters").nullable().optional(),
    categoryId: z.string().uuid("Invalid category ID").nullable().optional(),
    brandId: z.string().uuid("Invalid brand ID").nullable().optional(),
    status: productStatusEnum.optional(),
    isFeatured: z.boolean().optional(),
    seoTitle: z.string().trim().max(70, "SEO title should not exceed 70 characters").nullable().optional(),
    seoDescription: z.string().trim().max(160, "SEO description should not exceed 160 characters").nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});

/** Validation schema for querying products. */
export const productQuerySchema = z.object({
    search: z.string().trim().optional(),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
    status: productStatusEnum.optional(),
    isFeatured: z.preprocess((val) => {
        if (typeof val === "string") return val.toLowerCase() === "true";
        return val;
    }, z.boolean().optional()),
    includeArchived: z.preprocess((val) => {
        if (typeof val === "string") return val.toLowerCase() === "true";
        return val;
    }, z.boolean().optional().default(false)),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    cursor: z.string().trim().optional(),
    sortBy: z.enum(["name", "createdAt", "updatedAt", "status"]).optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

/** Validation schema for adding a single image to an existing product. */
export const addProductImageSchema = z.object({
    fileId: z.string().trim().optional().nullable(),
    url: z.string().trim().url("Invalid image URL"),
    altText: z.string().trim().max(200, "Alt text cannot exceed 200 characters").nullable().optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer").optional(),
}).strict();

/** Validation schema for uploading a product image via JSON body (base64 or remote URL). */
export const uploadProductImagePayloadSchema = z.object({
    file: z.string().min(1, "File data (base64 or remote URL) is required"),
    fileName: z.string().trim().max(255).optional(),
    altText: z.string().trim().max(200, "Alt text cannot exceed 200 characters").nullable().optional(),
    sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer").optional(),
}).strict();

/** Validation schema for batch reordering product images. */
export const reorderProductImagesSchema = z.object({
    images: z.array(z.object({
        id: z.string().uuid("Invalid image ID"),
        sortOrder: z.coerce.number().int().min(0, "Sort order must be a non-negative integer"),
    })).min(1, "At least one image order must be specified"),
}).strict();

export type ProductImageInput = z.infer<typeof productImageInputSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type AddProductImageInput = z.infer<typeof addProductImageSchema>;
export type UploadProductImagePayloadInput = z.infer<typeof uploadProductImagePayloadSchema>;
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesSchema>;

