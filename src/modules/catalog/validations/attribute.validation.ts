import { z } from "zod";

export const attributeStatusEnum = z.enum([
    "DRAFT",
    "PENDING",
    "APPROVED",
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
]);
export type AttributeStatus = z.infer<typeof attributeStatusEnum>;

/**
 * Validation schema for creating a master Product Attribute.
 * Example: { name: "Storage", values: ["256GB", "512GB"], isGlobal: true, status: "APPROVED" }
 */
export const createAttributeSchema = z
    .object({
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
        isGlobal: z.boolean().optional().default(true),
        status: attributeStatusEnum.optional().default("ACTIVE"),
    })
    .strict();

/**
 * Validation schema for updating a master Product Attribute.
 * Supports updating name, replacing/syncing values, isGlobal, status, or any combination.
 */
export const updateAttributeSchema = z
    .object({
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
        isGlobal: z.boolean().optional(),
        status: attributeStatusEnum.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field (name, values, isGlobal, or status) must be provided for update",
    });

/**
 * Validation schema for querying attributes.
 */
export const attributeQuerySchema = z.object({
    search: z.string().trim().optional(),
    isGlobal: z
        .preprocess((val) => {
            if (typeof val === "string") {
                if (val.toLowerCase() === "true") return true;
                if (val.toLowerCase() === "false") return false;
            }
            return val;
        }, z.boolean().optional()),
    status: attributeStatusEnum.optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(["name", "status", "isGlobal", "createdAt", "updatedAt"]).optional().default("name"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type AttributeQueryInput = z.infer<typeof attributeQuerySchema>;

