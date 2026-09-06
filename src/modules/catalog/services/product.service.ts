import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { slugify } from "../utils/slug.util.js";
import { uploadToImageKit, deleteFromImageKit, getImageKitAuthParams } from "@/lib/imagekit.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";
import { paginateWithCursor } from "@/common/utils/cursorPagination.js";
import type {
    CreateProductInput,
    UpdateProductInput,
    ProductQueryInput,
    AddProductImageInput,
    ReorderProductImagesInput,
} from "../validations/product.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class ProductService {
    /**
     * Creates a new product, defaulting to DRAFT status.
     * Handles slug generation, SEO fields, and initial image uploads.
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

        // Verify category exists if provided
        if (input.categoryId) {
            const category = await prisma.category.findUnique({
                where: { id: input.categoryId },
            });
            if (!category) {
                throw new AppError("Category not found", 404);
            }
        }

        // Verify brand exists if provided
        if (input.brandId) {
            const brand = await prisma.brand.findUnique({
                where: { id: input.brandId },
            });
            if (!brand) {
                throw new AppError("Brand not found", 404);
            }
        }

        // Prepare image data with indexed default sortOrder
        const imagesData = input.images?.map((img, index) => ({
            url: img.url,
            altText: img.altText ?? null,
            sortOrder: img.sortOrder ?? index,
            fileId: img.fileId ?? null,
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
     * Updates an existing product's details and SEO information.
     * Enforces ownership or RBAC permission.
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
     * Archives a product (transitions status to ARCHIVED).
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
     * Deletes a product.
     * Soft-deletes active/archived products by setting deletedAt; hard-deletes if permanently requested or in draft.
     */
    async deleteProduct(id: string, user?: AuthorizationContext, permanent: boolean = false) {
        const existing = await prisma.product.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Product not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            PERMISSIONS.PRODUCT_DELETE,
        );

        if (permanent || existing.status === "DRAFT") {
            await prisma.product.delete({
                where: { id },
            });
            await this.invalidateProductCache(id, existing.slug);
            return { id, name: existing.name, deleted: true, permanent: true };
        }

        // Soft delete
        await prisma.product.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                status: "ARCHIVED",
            },
        });

        await this.invalidateProductCache(id, existing.slug);
        return { id, name: existing.name, deleted: true, permanent: false };
    }

    /**
     * Non-blocking cache invalidation helper for product mutations.
     */
    async invalidateProductCache(id?: string, ...slugs: (string | undefined)[]) {
        const promises: Promise<any>[] = [
            cacheService.invalidatePattern("cache:discovery:*"),
            cacheService.invalidatePattern("cache:product:list:*"),
            cacheService.invalidatePattern("cache:search:*"),
        ];

        if (id) {
            promises.push(cacheService.del(CACHE_KEYS.PRODUCT.BY_ID(id)));
        }
        for (const slug of slugs) {
            if (slug) {
                promises.push(cacheService.del(CACHE_KEYS.PRODUCT.BY_SLUG(slug)));
            }
        }

        await Promise.allSettled(promises);
    }

    /**
     * Retrieves a single product by ID (cached).
     */
    async getProductById(id: string) {
        const cacheKey = CACHE_KEYS.productById(id);
        return cacheService.getOrSet(
            cacheKey,
            async () => {
                const product = await prisma.product.findUnique({
                    where: { id },
                    include: {
                        category: true,
                        brand: true,
                        images: { orderBy: { sortOrder: "asc" } },
                        variants: {
                            include: {
                                attributeValues: {
                                    include: {
                                        attributeValue: {
                                            include: { attribute: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });

                if (!product) {
                    throw new AppError("Product not found", 404);
                }

                return product;
            },
            CACHE_TTL.ONE_HOUR,
        );
    }

    /**
     * Retrieves a single product by slug (cached).
     */
    async getProductBySlug(slug: string) {
        const cacheKey = CACHE_KEYS.productBySlug(slug);
        return cacheService.getOrSet(
            cacheKey,
            async () => {
                const product = await prisma.product.findUnique({
                    where: { slug },
                    include: {
                        category: true,
                        brand: true,
                        images: { orderBy: { sortOrder: "asc" } },
                        variants: true,
                    },
                });

                if (!product) {
                    throw new AppError("Product not found", 404);
                }

                return product;
            },
            CACHE_TTL.ONE_HOUR,
        );
    }

    /**
     * Lists products with multi-attribute filtering, search, pagination (offset or cursor), and sorting.
     */
    async listProducts(query: ProductQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.ProductWhereInput = {};

        if (!query.includeArchived) {
            where.deletedAt = null;
        }

        if (query.status) {
            where.status = query.status;
        }

        if (query.categoryId) {
            where.categoryId = query.categoryId;
        }

        if (query.brandId) {
            where.brandId = query.brandId;
        }

        if (query.isFeatured !== undefined) {
            where.isFeatured = query.isFeatured;
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
                { seoTitle: { contains: query.search, mode: "insensitive" } },
            ];
        }

        // Fast Cursor Pagination
        if (query.cursor) {
            const cursorResult = await paginateWithCursor(
                (args) =>
                    prisma.product.findMany({
                        where,
                        orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
                        include: {
                            category: { select: { id: true, name: true, slug: true } },
                            brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
                            images: { orderBy: { sortOrder: "asc" } },
                            _count: { select: { variants: true } },
                        },
                        ...args,
                    }),
                limit,
                query.cursor,
            );

            return {
                items: cursorResult.items,
                pageInfo: cursorResult.pageInfo,
                total: await prisma.product.count({ where }),
                page: 1,
                limit,
                totalPages: 1,
            };
        }

        const [total, products] = await Promise.all([
            prisma.product.count({ where }),
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
                include: {
                    category: { select: { id: true, name: true, slug: true } },
                    brand: { select: { id: true, name: true, slug: true, logoUrl: true } },
                    images: { orderBy: { sortOrder: "asc" } },
                    _count: { select: { variants: true } },
                },
            }),
        ]);

        return {
            items: products,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ==========================================
    // ==========================================
    // Product Images Management
    // ==========================================

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

        const data: Prisma.ProductImageUncheckedCreateInput = {
            productId,
            fileId: input.fileId ?? null,
            url: input.url,
            altText: input.altText ?? null,
            sortOrder,
        };

        return prisma.productImage.create({
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

        // Upload to ImageKit folder '/products/{productId}'
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

        const image = await prisma.productImage.create({
            data: {
                productId,
                fileId: uploadResult.fileId || null,
                url: uploadResult.url,
                altText: altText ?? null,
                sortOrder: targetSortOrder,
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

        const image = await prisma.productImage.findFirst({
            where: { id: imageId, productId },
        });

        if (!image) {
            throw new AppError("Product image not found", 404);
        }

        // Remove from ImageKit storage if fileId exists
        if (image.fileId) {
            await deleteFromImageKit(image.fileId);
        }

        await prisma.productImage.delete({
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
        const existingImages = await prisma.productImage.findMany({
            where: { id: { in: imageIds }, productId },
        });

        if (existingImages.length !== imageIds.length) {
            throw new AppError("One or more images do not belong to this product or do not exist", 400);
        }

        await prisma.$transaction(
            input.images.map((img) =>
                prisma.productImage.update({
                    where: { id: img.id },
                    data: { sortOrder: img.sortOrder },
                }),
            ),
        );

        await this.invalidateProductCache(productId, product.slug);
        return prisma.productImage.findMany({
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

export const productService = new ProductService();

