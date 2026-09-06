import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import type { SearchProductItem } from "./search.service.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";

export class DiscoveryService {
    /**
     * Helper to transform raw Prisma product entities into enriched product items with computed price & rating metrics.
     */
    private transformProducts(rawProducts: any[]): SearchProductItem[] {
        return rawProducts.map((p) => {
            const activeVariants = p.variants ?? [];
            const prices = activeVariants.map((v: any) => Number(v.price));
            const comparePrices = activeVariants
                .map((v: any) => (v.compareAtPrice ? Number(v.compareAtPrice) : null))
                .filter((v: any): v is number => v !== null);

            const startingPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
            const compareAtPrice = comparePrices.length > 0 ? Math.max(...comparePrices) : null;

            const totalStock = activeVariants.reduce(
                (sum: number, v: any) => sum + (v.inventory?.availableQuantity ?? 0),
                0,
            );

            const ratings = (p.reviews ?? []).map((r: any) => r.rating);
            const reviewCount = ratings.length;
            const averageRating =
                reviewCount > 0
                    ? Number((ratings.reduce((a: number, b: number) => a + b, 0) / reviewCount).toFixed(1))
                    : 0;

            return {
                id: p.id,
                name: p.name,
                slug: p.slug,
                description: p.description,
                isFeatured: p.isFeatured,
                thumbnail: p.images?.[0]?.url ?? null,
                category: p.category ?? null,
                brand: p.brand ?? null,
                startingPrice,
                maxPrice,
                compareAtPrice,
                totalStock,
                inStock: totalStock > 0,
                averageRating,
                reviewCount,
                createdAt: p.createdAt,
            };
        });
    }

    /**
     * Retrieves spotlight/featured products.
     */
     async getFeaturedProducts(limit: number = 12, categoryId?: string) {
        return cacheService.getOrSet(
            CACHE_KEYS.DISCOVERY.FEATURED(limit, categoryId),
            async () => {
                const where: any = {
                    status: "ACTIVE",
                    isFeatured: true,
                };

                if (categoryId) {
                    where.categoryId = categoryId;
                }

                const rawProducts: any[] = await prisma.product.findMany({
                    where,
                    take: limit,
                    orderBy: { createdAt: "desc" },
                    include: {
                        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
                        brand: { select: { id: true, name: true, slug: true } },
                        category: { select: { id: true, name: true, slug: true } },
                        variants: {
                            where: { status: "ACTIVE" },
                            select: {
                                id: true,
                                sku: true,
                                price: true,
                                compareAtPrice: true,
                                inventory: { select: { availableQuantity: true } },
                            },
                        },
                        reviews: {
                            where: { status: "APPROVED" },
                            select: { rating: true },
                        },
                    },
                });

                return this.transformProducts(rawProducts);
            },
            CACHE_TTL.DISCOVERY_FEEDS,
        );
    }

    /**
     * Retrieves contextual related products for a product page.
     * Matches category, brand, or matching keyword tokens while strictly excluding the target product.
     */
    async getRelatedProducts(productId: string, limit: number = 8) {
        return cacheService.getOrSet(
            CACHE_KEYS.DISCOVERY.RELATED(productId, limit),
            async () => {
                const targetProduct = await prisma.product.findUnique({
                    where: { id: productId },
                    select: {
                        id: true,
                        name: true,
                        categoryId: true,
                        brandId: true,
                    },
                });

                if (!targetProduct) {
                    throw new AppError("Target product not found", 404);
                }

                const orConditions: any[] = [];
                if (targetProduct.categoryId) {
                    orConditions.push({ categoryId: targetProduct.categoryId });
                }
                if (targetProduct.brandId) {
                    orConditions.push({ brandId: targetProduct.brandId });
                }

                // Tokenize product name for keyword similarity
                const keywords = targetProduct.name
                    .split(/\s+/)
                    .map((k) => k.replace(/[^a-zA-Z0-9]/g, "").trim())
                    .filter((k) => k.length >= 3);

                for (const kw of keywords.slice(0, 3)) {
                    orConditions.push({ name: { contains: kw, mode: "insensitive" } });
                }

                const where: any = {
                    status: "ACTIVE",
                    id: { not: productId },
                };

                if (orConditions.length > 0) {
                    where.OR = orConditions;
                }

                const rawProducts: any[] = await prisma.product.findMany({
                    where,
                    take: limit,
                    orderBy: { createdAt: "desc" },
                    include: {
                        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
                        brand: { select: { id: true, name: true, slug: true } },
                        category: { select: { id: true, name: true, slug: true } },
                        variants: {
                            where: { status: "ACTIVE" },
                            select: {
                                id: true,
                                sku: true,
                                price: true,
                                compareAtPrice: true,
                                inventory: { select: { availableQuantity: true } },
                            },
                        },
                        reviews: {
                            where: { status: "APPROVED" },
                            select: { rating: true },
                        },
                    },
                });

                return this.transformProducts(rawProducts);
            },
            CACHE_TTL.DISCOVERY_FEEDS,
        );
    }

    /**
     * Retrieves top-rated and trending active products.
     */
    async getTrendingProducts(limit: number = 12) {
        return cacheService.getOrSet(
            CACHE_KEYS.DISCOVERY.TRENDING(limit),
            async () => {
                const rawProducts: any[] = await prisma.product.findMany({
                    where: { status: "ACTIVE" },
                    take: limit * 2,
                    include: {
                        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
                        brand: { select: { id: true, name: true, slug: true } },
                        category: { select: { id: true, name: true, slug: true } },
                        variants: {
                            where: { status: "ACTIVE" },
                            select: {
                                id: true,
                                sku: true,
                                price: true,
                                compareAtPrice: true,
                                inventory: { select: { availableQuantity: true } },
                            },
                        },
                        reviews: {
                            where: { status: "APPROVED" },
                            select: { rating: true },
                        },
                    },
                });

                const items = this.transformProducts(rawProducts);
                // Sort by highest average rating and review volume
                items.sort((a, b) => b.averageRating - a.averageRating || b.reviewCount - a.reviewCount);

                return items.slice(0, limit);
            },
            CACHE_TTL.DISCOVERY_FEEDS,
        );
    }

    /**
     * Retrieves latest new arrivals across the catalog.
     */
    async getNewArrivals(limit: number = 12, categoryId?: string) {
        return cacheService.getOrSet(
            CACHE_KEYS.DISCOVERY.NEW_ARRIVALS(limit, categoryId),
            async () => {
                const where: any = { status: "ACTIVE" };
                if (categoryId) where.categoryId = categoryId;

                const rawProducts: any[] = await prisma.product.findMany({
                    where,
                    take: limit,
                    orderBy: { createdAt: "desc" },
                    include: {
                        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
                        brand: { select: { id: true, name: true, slug: true } },
                        category: { select: { id: true, name: true, slug: true } },
                        variants: {
                            where: { status: "ACTIVE" },
                            select: {
                                id: true,
                                sku: true,
                                price: true,
                                compareAtPrice: true,
                                inventory: { select: { availableQuantity: true } },
                            },
                        },
                        reviews: {
                            where: { status: "APPROVED" },
                            select: { rating: true },
                        },
                    },
                });

                return this.transformProducts(rawProducts);
            },
            CACHE_TTL.DISCOVERY_FEEDS,
        );
    }
}

export const discoveryService = new DiscoveryService();
