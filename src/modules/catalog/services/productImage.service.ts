import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { uploadToImageKit, deleteFromImageKit, getImageKitAuthParams } from "@/lib/imagekit.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS } from "@/common/cache/cache.keys.js";
import type { AddProductImageInput, ReorderProductImagesInput } from "../validations/product.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class ProductImageService {
    private async invalidateProductCache(id: string, slug?: string) {
        await Promise.all([
            cacheService.del(CACHE_KEYS.PRODUCT.BY_ID(id)),
            slug ? cacheService.del(CACHE_KEYS.PRODUCT.BY_SLUG(slug)) : Promise.resolve(),
        ]);
    }

    /**
     * Adds an image record by URL to a product, auto-assigning sortOrder if omitted.
     */
    async addImage(productId: string, input: AddProductImageInput, user?: AuthorizationContext) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { images: { orderBy: { sortOrder: "desc" }, take: 1 } },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        let sortOrder = input.sortOrder;
        if (sortOrder === undefined) {
            const highestSortOrder = product.images[0]?.sortOrder ?? -1;
            sortOrder = highestSortOrder + 1;
        }

        const data: Prisma.ImageUncheckedCreateInput = {
            productId,
            fileId: input.fileId ?? null,
            url: input.url,
            thumbnailUrl: (input as any).thumbnailUrl ?? null,
            altText: input.altText ?? null,
            sortOrder,
            width: (input as any).width ?? null,
            height: (input as any).height ?? null,
            size: (input as any).size ?? null,
        };

        return prisma.image.create({
            data,
        });
    }

    /**
     * Uploads an image binary/string to ImageKit and stores the resulting image record.
     */
    async uploadImage(
        productId: string,
        file: Buffer | string,
        fileName: string,
        altText?: string | null,
        sortOrder?: number,
        mimeType?: string,
        user?: AuthorizationContext,
    ) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { images: { orderBy: { sortOrder: "desc" }, take: 1 } },
        });

        if (!product) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            product.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        const uploadResult = await uploadToImageKit({
            file,
            fileName: fileName || `product-${productId}-${Date.now()}`,
            folder: `/products/${productId}`,
            tags: ["product", productId],
            ...(mimeType ? { mimeType } : {}),
        });

        let targetSortOrder = sortOrder;
        if (targetSortOrder === undefined) {
            const highestSortOrder = product.images[0]?.sortOrder ?? -1;
            targetSortOrder = highestSortOrder + 1;
        }

        const image = await prisma.image.create({
            data: {
                productId,
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

        await this.invalidateProductCache(productId, product.slug);
        return image;
    }

    /**
     * Deletes a specific image from a product, and purges it from ImageKit if tracked.
     */
    async deleteImage(productId: string, imageId: string, user?: AuthorizationContext) {
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

        const image = await prisma.image.findFirst({
            where: { id: imageId, productId },
        });

        if (!image) {
            throw new AppError("Product image not found", 404);
        }

        if (image.fileId) {
            await deleteFromImageKit(image.fileId);
        }

        await prisma.image.delete({
            where: { id: imageId },
        });

        await this.invalidateProductCache(productId, product.slug);
        return { id: imageId, productId, deleted: true };
    }

    /**
     * Batch reorders images for a product within a transaction.
     */
    async reorderImages(productId: string, input: ReorderProductImagesInput, user?: AuthorizationContext) {
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

        const imageIds = input.images.map((img) => img.id);
        const existingImages = await prisma.image.findMany({
            where: { id: { in: imageIds }, productId },
        });

        if (existingImages.length !== imageIds.length) {
            throw new AppError("One or more images do not belong to this product or do not exist", 400);
        }

        await prisma.$transaction(
            input.images.map((img) =>
                prisma.image.update({
                    where: { id: img.id },
                    data: { sortOrder: img.sortOrder },
                }),
            ),
        );

        await this.invalidateProductCache(productId, product.slug);
        return prisma.image.findMany({
            where: { productId },
            orderBy: { sortOrder: "asc" },
        });
    }

    /**
     * Generates signed client-side authentication parameters for direct frontend ImageKit uploads.
     */
    getImageKitAuth(user?: AuthorizationContext) {
        if (!user) {
            throw new AppError("Authentication required", 401);
        }
        return getImageKitAuthParams();
    }
}

export const productImageService = new ProductImageService();
