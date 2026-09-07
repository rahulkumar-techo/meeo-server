import { z } from "zod";

/**
 * Validation schema for creating a master Product Attribute.
 * Example: { name: "Color", values: ["Red", "Blue", "Black"] }
 */
export const createAttributeSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Attribute name is required")
        .max(50, "Attribute name cannot exceed 50 characters"),
    values: z
        .array(
            z
                .string()
                .trim()
                .min(1, "Value cannot be empty")
                .max(50, "Value cannot exceed 50 characters"),
        )
        .optional()
        .default([]),
}).strict();

/**
 * Validation schema for updating a master Product Attribute.
 * Supports updating name, replacing/syncing values, or both.
 */
export const updateAttributeSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Attribute name cannot be empty")
        .max(50, "Attribute name cannot exceed 50 characters")
        .optional(),
    values: z
        .array(
            z
                .string()
                .trim()
                .min(1, "Value cannot be empty")
                .max(50, "Value cannot exceed 50 characters"),
        )
        .optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field (name or values) must be provided for update",
});

/**
 * Validation schema for querying attributes.
 */
export const attributeQuerySchema = z.object({
    search: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["name", "createdAt"]).optional().default("name"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type AttributeQueryInput = z.infer<typeof attributeQuerySchema>;
