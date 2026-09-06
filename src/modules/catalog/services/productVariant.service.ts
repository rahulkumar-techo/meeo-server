import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import type {
    CreateProductVariantInput,
    UpdateProductVariantInput,
    BatchCreateVariantsInput,
    ProductVariantQueryInput,
} from "../validations/productVariant.validation.js";
import { Prisma } from "@/generated/prisma/client.js";

/** Default include object for rich variant queries including attributes and inventory */
const variantDefaultInclude = {
    inventory: true,
    attributeValues: {
        include: {
            attributeValue: {
                include: {
                    attribute: true,
                },
            },
        },
    },
};

export class ProductVariantService {
    /**
     * Creates a new purchasable product variant with pricing, SKU, barcode, attributes, and initial inventory.
     */
    async createVariant(productId: string, input: CreateProductVariantInput, user?: AuthorizationContext) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        // Ensure unique SKU
        const existingSku = await prisma.productVariant.findUnique({
            where: { sku: input.sku },
        });

        if (existingSku) {
            throw new AppError(`A product variant with SKU '${input.sku}' already exists`, 409);
        }

        // Validate attribute value IDs if provided
        if (input.attributeValueIds && input.attributeValueIds.length > 0) {
            const attributeValues = await prisma.productAttributeValue.findMany({
                where: { id: { in: input.attributeValueIds } },
            });

            if (attributeValues.length !== input.attributeValueIds.length) {
                throw new AppError("One or more attribute value IDs do not exist", 400);
            }
        }

        return prisma.$transaction(async (tx) => {
            const variantData: Prisma.ProductVariantUncheckedCreateInput = {
                productId,
                sku: input.sku,
                barcode: input.barcode ?? null,
                price: new Prisma.Decimal(input.price),
                compareAtPrice: input.compareAtPrice !== undefined && input.compareAtPrice !== null
                    ? new Prisma.Decimal(input.compareAtPrice)
                    : null,
                costPrice: input.costPrice !== undefined && input.costPrice !== null
                    ? new Prisma.Decimal(input.costPrice)
                    : null,
                status: input.status ?? "ACTIVE",
            };

            const createdVariant = await tx.productVariant.create({
                data: variantData,
            });

            // Associate attribute values
            if (input.attributeValueIds && input.attributeValueIds.length > 0) {
                await tx.variantAttributeValue.createMany({
                    data: input.attributeValueIds.map((attrValId) => ({
                        variantId: createdVariant.id,
                        attributeValueId: attrValId,
                    })),
                });
            }

            // Create initial inventory tracking record
            await tx.inventory.create({
                data: {
                    variantId: createdVariant.id,
                    availableQuantity: input.initialStock ?? 0,
                    reservedQuantity: 0,
                    reorderLevel: input.reorderLevel ?? null,
                },
            });

            return tx.productVariant.findUnique({
                where: { id: createdVariant.id },
                include: variantDefaultInclude,
            });
        });
    }

    /**
     * Lists all variants of a product with optional search, status filtering, and pagination.
     */
    async getVariantsByProductId(productId: string, query: ProductVariantQueryInput) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.ProductVariantWhereInput = {
            productId,
            ...(query.status !== undefined && { status: query.status }),
            ...(query.search && {
                OR: [
                    { sku: { contains: query.search, mode: "insensitive" } },
                    { barcode: { contains: query.search, mode: "insensitive" } },
                ],
            }),
        };

        const orderBy: Prisma.ProductVariantOrderByWithRelationInput = {
            [query.sortBy ?? "createdAt"]: query.sortOrder ?? "asc",
        };

        const [variants, total] = await Promise.all([
            prisma.productVariant.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: variantDefaultInclude,
            }),
            prisma.productVariant.count({ where }),
        ]);

        return {
            items: variants,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Retrieves a single variant by UUID.
     */
    async getVariantById(variantId: string) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                        createdById: true,
                    },
                },
                ...variantDefaultInclude,
            },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        return variant;
    }

    /**
     * Retrieves a single variant by unique SKU.
     */
    async getVariantBySku(sku: string) {
        const variant = await prisma.productVariant.findUnique({
            where: { sku: sku.toUpperCase() },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                        createdById: true,
                    },
                },
                ...variantDefaultInclude,
            },
        });

        if (!variant) {
            throw new AppError(`Product variant with SKU '${sku}' not found`, 404);
        }

        return variant;
    }

    /**
     * Updates an existing product variant details, pricing, SKU, barcode, and attribute associations.
     */
    async updateVariant(variantId: string, input: UpdateProductVariantInput, user?: AuthorizationContext) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            variant.product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        // Check SKU uniqueness if SKU is changing
        if (input.sku && input.sku !== variant.sku) {
            const existingSku = await prisma.productVariant.findUnique({
                where: { sku: input.sku },
            });

            if (existingSku && existingSku.id !== variantId) {
                throw new AppError(`A product variant with SKU '${input.sku}' already exists`, 409);
            }
        }

        // Validate attribute value IDs if provided
        if (input.attributeValueIds) {
            if (input.attributeValueIds.length > 0) {
                const attributeValues = await prisma.productAttributeValue.findMany({
                    where: { id: { in: input.attributeValueIds } },
                });

                if (attributeValues.length !== input.attributeValueIds.length) {
                    throw new AppError("One or more attribute value IDs do not exist", 400);
                }
            }
        }

        return prisma.$transaction(async (tx) => {
            const data: Prisma.ProductVariantUpdateInput = {
                ...(input.sku !== undefined && { sku: input.sku }),
                ...(input.barcode !== undefined && { barcode: input.barcode }),
                ...(input.price !== undefined && { price: new Prisma.Decimal(input.price) }),
                ...(input.compareAtPrice !== undefined && {
                    compareAtPrice: input.compareAtPrice !== null ? new Prisma.Decimal(input.compareAtPrice) : null,
                }),
                ...(input.costPrice !== undefined && {
                    costPrice: input.costPrice !== null ? new Prisma.Decimal(input.costPrice) : null,
                }),
                ...(input.status !== undefined && { status: input.status }),
            };

            await tx.productVariant.update({
                where: { id: variantId },
                data,
            });

            // Update attribute connections if specified
            if (input.attributeValueIds !== undefined) {
                await tx.variantAttributeValue.deleteMany({
                    where: { variantId },
                });

                if (input.attributeValueIds.length > 0) {
                    await tx.variantAttributeValue.createMany({
                        data: input.attributeValueIds.map((attrValId) => ({
                            variantId,
                            attributeValueId: attrValId,
                        })),
                    });
                }
            }

            return tx.productVariant.findUnique({
                where: { id: variantId },
                include: variantDefaultInclude,
            });
        });
    }

    /**
     * Deletes a product variant from the catalog.
     */
    async deleteVariant(variantId: string, user?: AuthorizationContext) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            variant.product.createdById,
            user,
            PERMISSIONS.PRODUCT_DELETE,
        );

        await prisma.productVariant.delete({
            where: { id: variantId },
        });

        return { id: variantId, productId: variant.productId, deleted: true };
    }

    /**
     * Batch creates multiple variants for a product transactionally.
     */
    async batchCreateVariants(productId: string, input: BatchCreateVariantsInput, user?: AuthorizationContext) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        // Check for duplicate SKUs within input list
        const inputSkus = input.variants.map((v) => v.sku);
        const uniqueSkus = new Set(inputSkus);
        if (uniqueSkus.size !== inputSkus.length) {
            throw new AppError("Duplicate SKUs detected in batch creation list", 400);
        }

        // Check for existing SKUs in database
        const existingVariants = await prisma.productVariant.findMany({
            where: { sku: { in: inputSkus } },
            select: { sku: true },
        });

        if (existingVariants.length > 0) {
            const dupes = existingVariants.map((v) => v.sku).join(", ");
            throw new AppError(`The following SKUs already exist in database: ${dupes}`, 409);
        }

        return prisma.$transaction(async (tx) => {
            const results = [];

            for (const item of input.variants) {
                const created = await tx.productVariant.create({
                    data: {
                        productId,
                        sku: item.sku,
                        barcode: item.barcode ?? null,
                        price: new Prisma.Decimal(item.price),
                        compareAtPrice: item.compareAtPrice !== undefined && item.compareAtPrice !== null
                            ? new Prisma.Decimal(item.compareAtPrice)
                            : null,
                        costPrice: item.costPrice !== undefined && item.costPrice !== null
                            ? new Prisma.Decimal(item.costPrice)
                            : null,
                        status: item.status ?? "ACTIVE",
                    },
                });

                if (item.attributeValueIds && item.attributeValueIds.length > 0) {
                    await tx.variantAttributeValue.createMany({
                        data: item.attributeValueIds.map((attrValId) => ({
                            variantId: created.id,
                            attributeValueId: attrValId,
                        })),
                    });
                }

                await tx.inventory.create({
                    data: {
                        variantId: created.id,
                        availableQuantity: item.initialStock ?? 0,
                        reservedQuantity: 0,
                        reorderLevel: item.reorderLevel ?? null,
                    },
                });

                results.push(created.id);
            }

            return tx.productVariant.findMany({
                where: { id: { in: results } },
                include: variantDefaultInclude,
            });
        });
    }
}

export const productVariantService = new ProductVariantService();
