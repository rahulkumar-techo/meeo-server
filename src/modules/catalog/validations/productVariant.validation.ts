import { z } from "zod";
import { productStatusEnum } from "./category.validation.js";

/** Regex for SKU format: Uppercase alphanumeric with hyphens, underscores, or dots */
export const skuRegex = /^[A-Za-z0-9._-]+$/;

/**
 * Validation schema for creating a new product variant.
 * Supports SKU, Barcode, Price, Compare-at Price, Cost Price, Attributes, and Initial Stock.
 */
export const createProductVariantSchema = z.object({
    sku: z
        .string()
        .trim()
        .min(1, "SKU is required")
        .max(64, "SKU cannot exceed 64 characters")
        .regex(skuRegex, "SKU must contain only letters, numbers, hyphens, dots, or underscores")
        .transform((val) => val.toUpperCase()),

    barcode: z
        .string()
        .trim()
        .max(64, "Barcode cannot exceed 64 characters")
        .nullable()
        .optional(),

    price: z
        .coerce
        .number()
        .positive("Price must be greater than 0")
        .max(999999999.99, "Price exceeds maximum allowable value"),

    compareAtPrice: z
        .coerce
        .number()
        .min(0, "Compare-at price cannot be negative")
        .max(999999999.99, "Compare-at price exceeds maximum allowable value")
        .nullable()
        .optional(),

    costPrice: z
        .coerce
        .number()
        .min(0, "Cost price cannot be negative")
        .max(999999999.99, "Cost price exceeds maximum allowable value")
        .nullable()
        .optional(),

    status: productStatusEnum.optional().default("ACTIVE"),

    attributeValueIds: z
        .array(z.string().uuid("Invalid attribute value ID"))
        .optional()
        .default([]),

    initialStock: z
        .coerce
        .number()
        .int("Initial stock must be an integer")
        .min(0, "Initial stock cannot be negative")
        .optional()
        .default(0),

    reorderLevel: z
        .coerce
        .number()
        .int("Reorder level must be an integer")
        .min(0, "Reorder level cannot be negative")
        .nullable()
        .optional(),
}).strict().refine(
    (data) => {
        if (data.compareAtPrice !== null && data.compareAtPrice !== undefined) {
            return data.compareAtPrice >= data.price;
        }
        return true;
    },
    {
        message: "Compare-at price (original price) should be greater than or equal to current selling price",
        path: ["compareAtPrice"],
    }
);

/**
 * Validation schema for updating an existing product variant.
 */
export const updateProductVariantSchema = z.object({
    sku: z
        .string()
        .trim()
        .min(1, "SKU cannot be empty")
        .max(64, "SKU cannot exceed 64 characters")
        .regex(skuRegex, "SKU must contain only letters, numbers, hyphens, dots, or underscores")
        .transform((val) => val.toUpperCase())
        .optional(),

    barcode: z
        .string()
        .trim()
        .max(64, "Barcode cannot exceed 64 characters")
        .nullable()
        .optional(),

    price: z
        .coerce
        .number()
        .positive("Price must be greater than 0")
        .max(999999999.99, "Price exceeds maximum allowable value")
        .optional(),

    compareAtPrice: z
        .coerce
        .number()
        .min(0, "Compare-at price cannot be negative")
        .max(999999999.99, "Compare-at price exceeds maximum allowable value")
        .nullable()
        .optional(),

    costPrice: z
        .coerce
        .number()
        .min(0, "Cost price cannot be negative")
        .max(999999999.99, "Cost price exceeds maximum allowable value")
        .nullable()
        .optional(),

    status: productStatusEnum.optional(),

    attributeValueIds: z
        .array(z.string().uuid("Invalid attribute value ID"))
        .optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});

/**
 * Validation schema for batch creating product variants.
 */
export const batchCreateVariantsSchema = z.object({
    variants: z
        .array(createProductVariantSchema)
        .min(1, "At least one variant must be provided")
        .max(100, "Cannot create more than 100 variants in a single batch"),
}).strict();

/**
 * Validation schema for querying variants of a product.
 */
export const productVariantQuerySchema = z.object({
    search: z.string().trim().optional(),
    status: productStatusEnum.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["sku", "price", "createdAt", "updatedAt", "status"]).optional().default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CreateProductVariantInput = {
    sku: string;
    barcode?: string | null | undefined;
    price: number;
    compareAtPrice?: number | null | undefined;
    costPrice?: number | null | undefined;
    status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
    attributeValueIds?: string[] | undefined;
    initialStock?: number | undefined;
    reorderLevel?: number | null | undefined;
};

export type UpdateProductVariantInput = {
    sku?: string | undefined;
    barcode?: string | null | undefined;
    price?: number | undefined;
    compareAtPrice?: number | null | undefined;
    costPrice?: number | null | undefined;
    status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
    attributeValueIds?: string[] | undefined;
};

export type BatchCreateVariantsInput = {
    variants: CreateProductVariantInput[];
};

export type ProductVariantQueryInput = {
    search?: string | undefined;
    status?: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: "sku" | "price" | "createdAt" | "updatedAt" | "status" | undefined;
    sortOrder?: "asc" | "desc" | undefined;
};
