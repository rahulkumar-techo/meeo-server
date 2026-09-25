import { prisma } from "@/lib/prisma.js";
import type { SearchSuggestionsQueryInput } from "../validations/search.validation.js";
import type { SearchProductItem } from "./search.service.js";

export class SearchAggregationService {
    /**
     * Resolves all descendant category IDs recursively.
     */
    async getAllChildCategoryIds(parentId: string): Promise<string[]> {
        // fix:expensive computations - Single query to fetch active category tree avoiding N+1 database round-trips
        const allCategories = await prisma.category.findMany({
            where: { status: "ACTIVE" },
            select: { id: true, parentId: true },
        });

        const childrenMap = new Map<string, string[]>();
        for (const cat of allCategories) {
            if (cat.parentId) {
                const list = childrenMap.get(cat.parentId) || [];
                list.push(cat.id);
                childrenMap.set(cat.parentId, list);
            }
        }

        const categoryIds: string[] = [parentId];
        const queue: string[] = [parentId];

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const children = childrenMap.get(currentId);
            if (children) {
                for (const childId of children) {
                    categoryIds.push(childId);
                    queue.push(childId);
                }
            }
        }

        return categoryIds;
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
    buildFacetedFilters(items: SearchProductItem[]) {
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

export const searchAggregationService = new SearchAggregationService();
