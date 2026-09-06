import { prisma } from "@/lib/prisma.js";
import type {
    ProductSearchServiceInput,
    SearchSuggestionsQueryInput,
} from "../validations/search.validation.js";

export interface SearchProductItem {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isFeatured: boolean;
    thumbnail: string | null;
    category: { id: string; name: string; slug: string } | null;
    brand: { id: string; name: string; slug: string } | null;
    startingPrice: number;
    maxPrice: number;
    compareAtPrice: number | null;
    totalStock: number;
    inStock: boolean;
    averageRating: number;
    reviewCount: number;
    createdAt: Date;
}

export class SearchService {
    /**
     * Resolves all descendant category IDs recursively for a given parent category ID.
     */
    private async getAllChildCategoryIds(parentId: string): Promise<string[]> {
        const categoryIds: string[] = [parentId];
        const queue: string[] = [parentId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const children = await prisma.category.findMany({
                where: { parentId: currentId },
                select: { id: true },
            });

            for (const child of children) {
                categoryIds.push(child.id);
                queue.push(child.id);
            }
        }

        return categoryIds;
    }

    /**
     * Executes multi-field product search with category/brand/price/rating filtering, sorting, and pagination.
     */
    async searchProducts(query: ProductSearchServiceInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;

        // 1. Resolve Category IDs (including subcategories)
        let targetCategoryIds: string[] | undefined;
        if (query.categorySlug) {
            const cat = await prisma.category.findUnique({
                where: { slug: query.categorySlug },
                select: { id: true },
            });
            if (cat) {
                targetCategoryIds = await this.getAllChildCategoryIds(cat.id);
            } else {
                targetCategoryIds = []; // No matches for nonexistent category slug
            }
        } else if (query.categoryId) {
            targetCategoryIds = await this.getAllChildCategoryIds(query.categoryId);
        }

        // 2. Resolve Brand ID
        let targetBrandId: string | undefined = query.brandId;
        if (query.brandSlug) {
            const brand = await prisma.brand.findUnique({
                where: { slug: query.brandSlug },
                select: { id: true },
            });
            if (brand) {
                targetBrandId = brand.id;
            } else {
                targetBrandId = "00000000-0000-0000-0000-000000000000"; // No matches
            }
        }

        // 3. Build Prisma Where Clause
        const where: any = {
            status: "ACTIVE",
        };

        if (targetCategoryIds !== undefined) {
            where.categoryId = { in: targetCategoryIds };
        }

        if (targetBrandId !== undefined) {
            where.brandId = targetBrandId;
        }

        if (query.isFeatured !== undefined) {
            where.isFeatured = query.isFeatured;
        }

        // Text Search
        if (query.q && query.q.trim().length > 0) {
            const searchTerm = query.q.trim();
            where.OR = [
                { name: { contains: searchTerm, mode: "insensitive" } },
                { description: { contains: searchTerm, mode: "insensitive" } },
                { seoTitle: { contains: searchTerm, mode: "insensitive" } },
                { seoDescription: { contains: searchTerm, mode: "insensitive" } },
                { brand: { name: { contains: searchTerm, mode: "insensitive" } } },
                { category: { name: { contains: searchTerm, mode: "insensitive" } } },
                { variants: { some: { sku: { contains: searchTerm, mode: "insensitive" } } } },
            ];
        }

        // Variant filters (Price range & stock availability)
        const variantWhere: any = {
            status: "ACTIVE",
        };

        if (query.minPrice !== undefined || query.maxPrice !== undefined) {
            variantWhere.price = {};
            if (query.minPrice !== undefined) variantWhere.price.gte = query.minPrice;
            if (query.maxPrice !== undefined) variantWhere.price.lte = query.maxPrice;
        }

        if (query.inStockOnly) {
            variantWhere.inventory = {
                availableQuantity: { gt: 0 },
            };
        }

        where.variants = {
            some: variantWhere,
        };

        // 4. Query matching products
        const rawProducts: any[] = await prisma.product.findMany({
            where,
            include: {
                images: {
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                    select: { url: true },
                },
                brand: {
                    select: { id: true, name: true, slug: true },
                },
                category: {
                    select: { id: true, name: true, slug: true },
                },
                variants: {
                    where: { status: "ACTIVE" },
                    select: {
                        id: true,
                        sku: true,
                        price: true,
                        compareAtPrice: true,
                        inventory: {
                            select: { availableQuantity: true },
                        },
                    },
                },
                reviews: {
                    where: { status: "APPROVED" },
                    select: { rating: true },
                },
            },
            orderBy: query.sortBy === "newest" ? { createdAt: "desc" } : { createdAt: "desc" },
        });

        // 5. Transform & compute dynamic metrics per product
        let items: SearchProductItem[] = rawProducts.map((p) => {
            const activeVariants: any[] = p.variants ?? [];
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

        // 6. Apply In-Stock Filter (if total product stock required)
        if (query.inStockOnly) {
            items = items.filter((item) => item.inStock);
        }

        // 7. Apply Rating Filter
        if (query.minRating !== undefined) {
            items = items.filter((item) => item.averageRating >= query.minRating!);
        }

        // 8. Sorting
        const sortBy = query.sortBy ?? "relevance";
        if (sortBy === "price_asc") {
            items.sort((a, b) => a.startingPrice - b.startingPrice);
        } else if (sortBy === "price_desc") {
            items.sort((a, b) => b.startingPrice - a.startingPrice);
        } else if (sortBy === "rating_desc") {
            items.sort((a, b) => b.averageRating - a.averageRating || b.reviewCount - a.reviewCount);
        } else if (sortBy === "popularity") {
            items.sort((a, b) => b.reviewCount - a.reviewCount);
        } else if (sortBy === "relevance" && query.q) {
            const lowerQ = query.q.toLowerCase();
            items.sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aExact = aName === lowerQ ? 2 : aName.startsWith(lowerQ) ? 1 : 0;
                const bExact = bName === lowerQ ? 2 : bName.startsWith(lowerQ) ? 1 : 0;
                return bExact - aExact;
            });
        }

        // 9. Pagination
        const total = items.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const skip = (page - 1) * limit;
        const paginatedItems = items.slice(skip, skip + limit);

        return {
            items: paginatedItems,
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
     * Autocomplete search suggestions (products, brands, categories).
     */
    async getSearchSuggestions(query: SearchSuggestionsQueryInput) {
        const q = query.q.trim();
        const limit = query.limit ?? 8;

        const [products, brands, categories] = await Promise.all([
            prisma.product.findMany({
                where: {
                    status: "ACTIVE",
                    name: { contains: q, mode: "insensitive" },
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    images: { take: 1, select: { url: true } },
                },
                take: limit,
            }),
            prisma.brand.findMany({
                where: {
                    name: { contains: q, mode: "insensitive" },
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    _count: { select: { products: true } },
                },
                take: 5,
            }),
            prisma.category.findMany({
                where: {
                    name: { contains: q, mode: "insensitive" },
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    _count: { select: { products: true } },
                },
                take: 5,
            }),
        ]);

        return {
            query: q,
            products: products.map((p) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                thumbnail: p.images[0]?.url ?? null,
            })),
            brands: brands.map((b) => ({
                id: b.id,
                name: b.name,
                slug: b.slug,
                productCount: b._count.products,
            })),
            categories: categories.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                productCount: c._count.products,
            })),
        };
    }

    /**
     * Aggregates faceted filter options (brands, categories, price range) for the current search context.
     */
    async getFacetedFilters(query: ProductSearchServiceInput) {
        // Execute full search without pagination to build dynamic facets
        const { items } = await this.searchProducts({ ...query, page: 1, limit: 1000 });

        const brandCounts: Record<string, { id: string; name: string; slug: string; count: number }> = {};
        const categoryCounts: Record<string, { id: string; name: string; slug: string; count: number }> = {};

        let minPrice = items.length > 0 ? items[0]!.startingPrice : 0;
        let maxPrice = items.length > 0 ? items[0]!.maxPrice : 0;

        for (const item of items) {
            if (item.brand) {
                if (!brandCounts[item.brand.id]) {
                    brandCounts[item.brand.id] = { ...item.brand, count: 0 };
                }
                brandCounts[item.brand.id]!.count++;
            }

            if (item.category) {
                if (!categoryCounts[item.category.id]) {
                    categoryCounts[item.category.id] = { ...item.category, count: 0 };
                }
                categoryCounts[item.category.id]!.count++;
            }

            if (item.startingPrice < minPrice) minPrice = item.startingPrice;
            if (item.maxPrice > maxPrice) maxPrice = item.maxPrice;
        }

        return {
            totalMatching: items.length,
            priceRange: {
                min: minPrice,
                max: maxPrice,
            },
            brands: Object.values(brandCounts).sort((a, b) => b.count - a.count),
            categories: Object.values(categoryCounts).sort((a, b) => b.count - a.count),
        };
    }
}

export const searchService = new SearchService();
