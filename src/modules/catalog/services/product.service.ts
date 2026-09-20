import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { slugify } from "../utils/slug.util.js";
import { productImageService } from "./productImage.service.js";
import { productQueryService } from "./productQuery.service.js";
import type {
    CreateProductInput,
    UpdateProductInput,
    ProductQueryInput,
    AddProductImageInput,
    ReorderProductImagesInput,
} from "../validations/product.validation.js";
import { Prisma } from "@/generated/prisma/client.js";

export { productImageService } from "./productImage.service.js";
export { productQueryService } from "./productQuery.service.js";

export class ProductService {
    private async invalidateProductCache(id: string, slug?: string) {
        return productQueryService.invalidateProductCache(id, slug);
    }

    /**
     * Creates a new product, defaulting to DRAFT status.
     * Handles slug generation, SEO fields, dynamic specifications, and initial image uploads.
     */
    async createProduct(input: CreateProductInput, creatorId?: string) {
        const slug = input.slug || slugify(input.name);

        if (!slug) {
            throw new AppError("Product name must contain valid alphanumeric characters for slug generation", 400);
        }

        const existingWithSlug = await prisma.product.findUnique({
            where: { slug },
        });

        if (existingWithSlug) {
            throw new AppError(`A product with slug '${slug}' already exists`, 409);
        }

        if (input.categoryId) {
            const category = await prisma.category.findUnique({
                where: { id: input.categoryId },
            });
            if (!category) {
                throw new AppError("Category not found", 404);
            }
        }

        if (input.brandId) {
            const brand = await prisma.brand.findUnique({
                where: { id: input.brandId },
            });
            if (!brand) {
                throw new AppError("Brand not found", 404);
            }
        }

        const imagesData = input.images?.map((img, index) => ({
            url: img.url,
            altText: img.altText ?? null,
            sortOrder: img.sortOrder ?? index,
            fileId: img.fileId ?? null,
            thumbnailUrl: img.thumbnailUrl ?? null,
            width: img.width ?? null,
            height: img.height ?? null,
            size: img.size ?? null,
        })) ?? [];

        const data: Prisma.ProductUncheckedCreateInput = {
            name: input.name,
            slug,
            description: input.description ?? null,
            categoryId: input.categoryId ?? null,
            brandId: input.brandId ?? null,
            status: input.status,
            isFeatured: input.isFeatured,
            seoTitle: input.seoTitle ?? input.name,
            seoDescription: input.seoDescription ?? (input.description ? input.description.slice(0, 160) : null),
            createdById: creatorId ?? null,
            ...(input.bannerImage !== undefined && {
                bannerImage: input.bannerImage === null ? Prisma.DbNull : (input.bannerImage as Prisma.InputJsonValue),
            }),
            ...(input.specifications !== undefined && {
                specifications: input.specifications === null ? Prisma.DbNull : (input.specifications as Prisma.InputJsonValue),
            }),
            ...(imagesData.length > 0 ? { images: { create: imagesData } } : {}),
        };

        const created = await prisma.product.create({
            data,
            include: {
                category: { select: { id: true, name: true, slug: true } },
                brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
                images: { orderBy: { sortOrder: "asc" } },
            },
        });

        await this.invalidateProductCache(created.id, created.slug);
        return created;
    }

    /**
     * Updates an existing product's details, SEO information, and specifications.
     */
    async updateProduct(id: string, input: UpdateProductInput, user?: AuthorizationContext) {
        const existing = await prisma.product.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        let slug = existing.slug;
        if (input.slug || (input.name && input.name !== existing.name && !input.slug)) {
            const candidateSlug = input.slug || slugify(input.name!);
            if (candidateSlug !== existing.slug) {
                const existingWithSlug = await prisma.product.findUnique({
                    where: { slug: candidateSlug },
                });
                if (existingWithSlug && existingWithSlug.id !== id) {
                    throw new AppError(`A product with slug '${candidateSlug}' already exists`, 409);
                }
                slug = candidateSlug;
            }
        }

        if (input.categoryId !== undefined && input.categoryId !== existing.categoryId && input.categoryId !== null) {
            const category = await prisma.category.findUnique({
                where: { id: input.categoryId },
            });
            if (!category) {
                throw new AppError("Category not found", 404);
            }
        }

        if (input.brandId !== undefined && input.brandId !== existing.brandId && input.brandId !== null) {
            const brand = await prisma.brand.findUnique({
                where: { id: input.brandId },
            });
            if (!brand) {
                throw new AppError("Brand not found", 404);
            }
        }

        const data: Prisma.ProductUncheckedUpdateInput = {
            slug,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
            ...(input.brandId !== undefined && { brandId: input.brandId }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
            ...(input.seoTitle !== undefined && { seoTitle: input.seoTitle }),
            ...(input.seoDescription !== undefined && { seoDescription: input.seoDescription }),
            ...(input.bannerImage !== undefined && {
                bannerImage: input.bannerImage === null ? Prisma.DbNull : (input.bannerImage as Prisma.InputJsonValue),
            }),
            ...(input.specifications !== undefined && {
                specifications: input.specifications === null ? Prisma.DbNull : (input.specifications as Prisma.InputJsonValue),
            }),
        };

        const updated = await prisma.product.update({
            where: { id },
            data,
            include: {
                category: { select: { id: true, name: true, slug: true } },
                brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
                images: { orderBy: { sortOrder: "asc" } },
            },
        });

        await this.invalidateProductCache(id, existing.slug);
        if (updated.slug !== existing.slug) {
            await this.invalidateProductCache(id, updated.slug);
        }

        return updated;
    }

    /**
     * Publishes a product (transitions status to ACTIVE).
     */
    async publishProduct(id: string, user?: AuthorizationContext) {
        const existing = await prisma.product.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        const published = await prisma.product.update({
            where: { id },
            data: {
                status: "ACTIVE",
                deletedAt: null,
            },
            include: {
                category: true,
                brand: true,
                images: { orderBy: { sortOrder: "asc" } },
            },
        });

        await this.invalidateProductCache(id, existing.slug);
        return published;
    }

    /**
     * Moves a product to DRAFT status.
     */
    async draftProduct(id: string, user?: AuthorizationContext) {
        const existing = await prisma.product.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        const drafted = await prisma.product.update({
            where: { id },
            data: {
                status: "DRAFT",
            },
            include: {
                category: true,
                brand: true,
                images: { orderBy: { sortOrder: "asc" } },
            },
        });

        await this.invalidateProductCache(id, existing.slug);
        return drafted;
    }

    /**
     * Moves a product to ARCHIVED status.
     */
    async archiveProduct(id: string, user?: AuthorizationContext) {
        const existing = await prisma.product.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_UPDATE,
        );

        const archived = await prisma.product.update({
            where: { id },
            data: {
                status: "ARCHIVED",
                deletedAt: new Date(),
            },
            include: {
                category: true,
                brand: true,
                images: { orderBy: { sortOrder: "asc" } },
            },
        });

        await this.invalidateProductCache(id, existing.slug);
        return archived;
    }

    /**
     * Permanently deletes a product and its associated assets.
     */
    async deleteProduct(id: string, user?: AuthorizationContext) {
        const existing = await prisma.product.findUnique({
            where: { id },
            include: { images: true },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_DELETE,
        );

        for (const image of existing.images) {
            if (image.fileId) {
                await productImageService.deleteImage(id, image.id, user).catch(() => {});
            }
        }

        await prisma.product.delete({
            where: { id },
        });

        await this.invalidateProductCache(id, existing.slug);
        return { id, deleted: true };
    }

    // Delegators for queries & image operations
    getProductById(id: string) {
        return productQueryService.getProductById(id);
    }

    getProductBySlug(slug: string) {
        return productQueryService.getProductBySlug(slug);
    }

    getProductAttributes(id: string) {
        return productQueryService.getProductAttributes(id);
    }

    listProducts(query: ProductQueryInput) {
        return productQueryService.listProducts(query);
    }

    addImage(productId: string, input: AddProductImageInput, user?: AuthorizationContext) {
        return productImageService.addImage(productId, input, user);
    }

    uploadImage(
        productId: string,
        file: Buffer | string,
        fileName: string,
        altText?: string | null,
        sortOrder?: number,
        mimeType?: string,
        user?: AuthorizationContext,
    ) {
        return productImageService.uploadImage(productId, file, fileName, altText, sortOrder, mimeType, user);
    }

    deleteImage(productId: string, imageId: string, user?: AuthorizationContext) {
        return productImageService.deleteImage(productId, imageId, user);
    }

    reorderImages(productId: string, input: ReorderProductImagesInput, user?: AuthorizationContext) {
        return productImageService.reorderImages(productId, input, user);
    }

    getImageKitAuth(user?: AuthorizationContext) {
        return productImageService.getImageKitAuth(user);
    }
}

export const productService = new ProductService();
