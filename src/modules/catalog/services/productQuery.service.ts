import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";
import { paginateWithCursor } from "@/common/utils/cursorPagination.js";
import type { ProductQueryInput } from "../validations/product.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class ProductQueryService {
    async invalidateProductCache(id: string, slug?: string) {
        await Promise.all([
            cacheService.del(CACHE_KEYS.PRODUCT.BY_ID(id)),
            slug ? cacheService.del(CACHE_KEYS.PRODUCT.BY_SLUG(slug)) : Promise.resolve(),
        ]);
    }

    /**
     * Retrieves a single product by UUID with category, brand, images, and variants.
     */
    async getProductById(id: string) {
        const cacheKey = CACHE_KEYS.PRODUCT.BY_ID(id);

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
                                inventory: true,
                                images: { orderBy: { sortOrder: "asc" } },
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
     * Retrieves a single product by SEO-friendly URL slug with full relations.
     */
    async getProductBySlug(slug: string) {
        const cacheKey = CACHE_KEYS.PRODUCT.BY_SLUG(slug);

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
     * Aggregates and returns all unique attributes and values configured across a product's variants.
     */
    async getProductAttributes(id: string) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: {
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

        const attributeMap = new Map<string, { id: string; name: string; values: { id: string; value: string }[] }>();

        for (const variant of product.variants) {
            for (const vav of variant.attributeValues) {
                const attr = vav.attributeValue.attribute;
                const val = vav.attributeValue;

                if (!attributeMap.has(attr.id)) {
                    attributeMap.set(attr.id, {
                        id: attr.id,
                        name: attr.name,
                        values: [],
                    });
                }

                const current = attributeMap.get(attr.id)!;
                if (!current.values.some((v) => v.id === val.id)) {
                    current.values.push({ id: val.id, value: val.value });
                }
            }
        }

        return Array.from(attributeMap.values());
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
                            variants: {
                                select: {
                                    id: true,
                                    sku: true,
                                    price: true,
                                    compareAtPrice: true,
                                    status: true,
                                },
                                orderBy: { createdAt: "asc" },
                            },
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
                    variants: {
                        select: {
                            id: true,
                            sku: true,
                            price: true,
                            compareAtPrice: true,
                            status: true,
                        },
                        orderBy: { createdAt: "asc" },
                    },
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
}

export const productQueryService = new ProductQueryService();
