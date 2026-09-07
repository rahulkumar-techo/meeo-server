import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type {
    CreateAttributeInput,
    UpdateAttributeInput,
    AttributeQueryInput,
} from "../validations/attribute.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class AttributeService {
    /**
     * Lists all master attributes with pagination, search, and values.
     */
    async listAttributes(query: AttributeQueryInput) {
        const { search, page = 1, limit = 20, sortBy = "name", sortOrder = "asc" } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.ProductAttributeWhereInput = {};

        if (search) {
            where.name = {
                contains: search,
                mode: "insensitive",
            };
        }

        const [items, total] = await Promise.all([
            prisma.productAttribute.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: {
                    values: {
                        orderBy: { value: "asc" },
                    },
                    _count: {
                        select: { values: true },
                    },
                },
            }),
            prisma.productAttribute.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }

    /**
     * Retrieves a single attribute by UUID with all its values.
     */
    async getAttributeById(id: string) {
        const attribute = await prisma.productAttribute.findUnique({
            where: { id },
            include: {
                values: {
                    orderBy: { value: "asc" },
                },
                _count: {
                    select: { values: true },
                },
            },
        });

        if (!attribute) {
            throw new AppError("Attribute not found", 404);
        }

        return attribute;
    }

    /**
     * Creates a new master attribute with optional initial values.
     */
    async createAttribute(input: CreateAttributeInput) {
        const normalizedName = input.name.trim();

        const existing = await prisma.productAttribute.findFirst({
            where: {
                name: {
                    equals: normalizedName,
                    mode: "insensitive",
                },
            },
        });

        if (existing) {
            throw new AppError(`An attribute with name '${normalizedName}' already exists`, 409);
        }

        // Deduplicate initial values if provided
        const uniqueValues = Array.from(
            new Set((input.values || []).map((v) => v.trim()).filter(Boolean)),
        );

        const data: Prisma.ProductAttributeCreateInput = {
            name: normalizedName,
        };

        if (uniqueValues.length > 0) {
            data.values = {
                create: uniqueValues.map((val) => ({
                    value: val,
                })),
            };
        }

        return prisma.productAttribute.create({
            data,
            include: {
                values: {
                    orderBy: { value: "asc" },
                },
                _count: {
                    select: { values: true },
                },
            },
        });
    }

    /**
     * Updates an attribute's name and/or adds/syncs its values.
     */
    async updateAttribute(id: string, input: UpdateAttributeInput) {
        const existing = await prisma.productAttribute.findUnique({
            where: { id },
            include: { values: true },
        });

        if (!existing) {
            throw new AppError("Attribute not found", 404);
        }

        const data: Prisma.ProductAttributeUpdateInput = {};

        // 1. Update Name if provided
        if (input.name) {
            const normalizedName = input.name.trim();

            if (normalizedName !== existing.name) {
                const conflict = await prisma.productAttribute.findFirst({
                    where: {
                        name: {
                            equals: normalizedName,
                            mode: "insensitive",
                        },
                        id: { not: id },
                    },
                });

                if (conflict) {
                    throw new AppError(`An attribute with name '${normalizedName}' already exists`, 409);
                }

                data.name = normalizedName;
            }
        }

        // 2. Add / Sync new values if provided
        if (input.values && input.values.length > 0) {
            const newValues = Array.from(
                new Set(input.values.map((v) => v.trim()).filter(Boolean)),
            );

            const existingValueSet = new Set(existing.values.map((v) => v.value.toLowerCase()));
            const toCreate = newValues.filter((v) => !existingValueSet.has(v.toLowerCase()));

            if (toCreate.length > 0) {
                data.values = {
                    create: toCreate.map((val) => ({
                        value: val,
                    })),
                };
            }
        }

        return prisma.productAttribute.update({
            where: { id },
            data,
            include: {
                values: {
                    orderBy: { value: "asc" },
                },
                _count: {
                    select: { values: true },
                },
            },
        });
    }

    /**
     * Deletes an attribute and cascades to its values and variant mappings.
     */
    async deleteAttribute(id: string) {
        const existing = await prisma.productAttribute.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Attribute not found", 404);
        }

        return prisma.productAttribute.delete({
            where: { id },
        });
    }
}

export const attributeService = new AttributeService();
