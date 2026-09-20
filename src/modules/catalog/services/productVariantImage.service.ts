import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { uploadToImageKit, deleteFromImageKit } from "@/lib/imagekit.js";
import type { AddProductImageInput, ReorderProductImagesInput } from "../validations/product.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class ProductVariantImageService {
    /**
     * Adds an image to a product variant by URL.
     */
    async addVariantImage(variantId: string, input: AddProductImageInput, user?: AuthorizationContext) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true, images: { orderBy: { sortOrder: "desc" }, take: 1 } },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            variant.product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        let sortOrder = input.sortOrder;
        if (sortOrder === undefined) {
            const highestSortOrder = variant.images[0]?.sortOrder ?? -1;
            sortOrder = highestSortOrder + 1;
        }

        const data: Prisma.ImageUncheckedCreateInput = {
            productVariantId: variantId,
            fileId: input.fileId ?? null,
            url: input.url,
            thumbnailUrl: (input as any).thumbnailUrl ?? null,
            altText: input.altText ?? null,
            sortOrder,
            width: (input as any).width ?? null,
            height: (input as any).height ?? null,
            size: (input as any).size ?? null,
        };

        return prisma.image.create({ data });
    }

    /**
     * Uploads an image file or payload to ImageKit and attaches to the product variant.
     */
    async uploadVariantImage(
        variantId: string,
        file: Buffer | string,
        fileName: string,
        altText?: string | null,
        sortOrder?: number,
        mimeType?: string,
        user?: AuthorizationContext,
    ) {
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true, images: { orderBy: { sortOrder: "desc" }, take: 1 } },
        });

        if (!variant) {
            throw new AppError("Product variant not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            variant.product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        const uploadResult = await uploadToImageKit({
            file,
            fileName: fileName || `variant-${variantId}-${Date.now()}`,
            folder: `/variants/${variantId}`,
            tags: ["variant", variantId, variant.sku],
            ...(mimeType ? { mimeType } : {}),
        });

        let targetSortOrder = sortOrder;
        if (targetSortOrder === undefined) {
            const highestSortOrder = variant.images[0]?.sortOrder ?? -1;
            targetSortOrder = highestSortOrder + 1;
        }

        return prisma.image.create({
            data: {
                productVariantId: variantId,
                fileId: uploadResult.fileId || null,
                url: uploadResult.url,
                thumbnailUrl: uploadResult.thumbnailUrl || null,
                altText: altText ?? null,
                sortOrder: targetSortOrder,
                width: uploadResult.width ?? null,
                height: uploadResult.height ?? null,
                size: uploadResult.size ?? null,
            },
        });
    }

    /**
     * Deletes a specific image from a product variant.
     */
    async deleteVariantImage(variantId: string, imageId: string, user?: AuthorizationContext) {
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

        const image = await prisma.image.findFirst({
            where: { id: imageId, productVariantId: variantId },
        });

        if (!image) {
            throw new AppError("Variant image not found", 404);
        }

        if (image.fileId) {
            await deleteFromImageKit(image.fileId);
        }

        await prisma.image.delete({
            where: { id: imageId },
        });

        return { id: imageId, variantId, deleted: true };
    }

    /**
     * Reorders images for a product variant.
     */
    async reorderVariantImages(variantId: string, input: ReorderProductImagesInput, user?: AuthorizationContext) {
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

        const imageIds = input.images.map((img) => img.id);
        const existingImages = await prisma.image.findMany({
            where: { id: { in: imageIds }, productVariantId: variantId },
        });

        if (existingImages.length !== imageIds.length) {
            throw new AppError("One or more images do not belong to this variant or do not exist", 400);
        }

        await prisma.$transaction(
            input.images.map((img) =>
                prisma.image.update({
                    where: { id: img.id },
                    data: { sortOrder: img.sortOrder },
                }),
            ),
        );

        return prisma.image.findMany({
            where: { productVariantId: variantId },
            orderBy: { sortOrder: "asc" },
        });
    }
}

export const productVariantImageService = new ProductVariantImageService();
