import { prisma } from "@/lib/prisma.js";
import { searchAggregationService } from "./searchAggregation.service.js";
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
     * Executes multi-field product search with category/brand/price/rating filtering, sorting, and pagination.
     */
    async searchProducts(query: ProductSearchServiceInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;

        // 1. Resolve Category IDs (including subcategories in a single batch query)
        let targetCategoryIds: string[] | undefined;
        if (query.categorySlug) {
            const cat = await prisma.category.findUnique({
                where: { slug: query.categorySlug },
                select: { id: true },
            });
            if (cat) {
                targetCategoryIds = await searchAggregationService.getAllChildCategoryIds(cat.id);
            } else {
                targetCategoryIds = [];
            }
        } else if (query.categoryId) {
            targetCategoryIds = await searchAggregationService.getAllChildCategoryIds(query.categoryId);
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
                targetBrandId = "00000000-0000-0000-0000-000000000000";
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

        // 6. Apply In-Stock Filter
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
    getSearchSuggestions(query: SearchSuggestionsQueryInput) {
        return searchAggregationService.getSearchSuggestions(query);
    }

    /**
     * Aggregates faceted filter options (brands, categories, price range) for the current search context.
     */
    async getFacetedFilters(query: ProductSearchServiceInput) {
        const { items } = await this.searchProducts({ ...query, page: 1, limit: 1000 });
        return searchAggregationService.buildFacetedFilters(items);
    }
}

export const searchService = new SearchService();

