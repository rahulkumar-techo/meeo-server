import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import type { BatchCreateVariantsInput } from "../validations/productVariant.validation.js";
import { Prisma } from "@/generated/prisma/client.js";

export const variantDefaultInclude = {
    inventory: true,
    images: { orderBy: { sortOrder: "asc" as const } },
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

export class ProductVariantBatchService {
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

        const inputSkus = input.variants.map((v) => v.sku);
        const uniqueSkus = new Set(inputSkus);
        if (uniqueSkus.size !== inputSkus.length) {
            throw new AppError("Duplicate SKUs detected in batch creation list", 400);
        }

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

                if (item.images && item.images.length > 0) {
                    await tx.image.createMany({
                        data: item.images.map((img, index) => ({
                            productVariantId: created.id,
                            url: img.url,
                            fileId: img.fileId ?? null,
                            thumbnailUrl: img.thumbnailUrl ?? null,
                            altText: img.altText ?? null,
                            sortOrder: img.sortOrder ?? index,
                            width: img.width ?? null,
                            height: img.height ?? null,
                            size: img.size ?? null,
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

export const productVariantBatchService = new ProductVariantBatchService();
