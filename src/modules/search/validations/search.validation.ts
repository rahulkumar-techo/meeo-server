import { z } from "zod";

/**
 * Validation schema for searching products with multi-faceted filtering, sorting, and pagination.
 */
export const productSearchQuerySchema = z.object({
    q: z.string().trim().optional(),
    categoryId: z.string().uuid("Invalid category ID format").optional(),
    categorySlug: z.string().trim().optional(),
    brandId: z.string().uuid("Invalid brand ID format").optional(),
    brandSlug: z.string().trim().optional(),
    minPrice: z.coerce.number().min(0, "Minimum price must be non-negative").optional(),
    maxPrice: z.coerce.number().min(0, "Maximum price must be non-negative").optional(),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    inStockOnly: z
        .preprocess((val) => {
            if (typeof val === "string") return val.toLowerCase() === "true";
            return val;
        }, z.boolean())
        .optional(),
    isFeatured: z
        .preprocess((val) => {
            if (typeof val === "string") return val.toLowerCase() === "true";
            return val;
        }, z.boolean())
        .optional(),
    sortBy: z
        .enum(["relevance", "price_asc", "price_desc", "newest", "rating_desc", "popularity"])
        .default("relevance"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).refine(
    (data) => {
        if (data.minPrice !== undefined && data.maxPrice !== undefined) {
            return data.minPrice <= data.maxPrice;
        }
        return true;
    },
    {
        message: "Maximum price must be greater than or equal to minimum price",
        path: ["maxPrice"],
    },
);

/**
 * Schema for quick search suggestions / autocomplete typeahead.
 */
export const searchSuggestionsQuerySchema = z.object({
    q: z.string().trim().min(1, "Search query is required"),
    limit: z.coerce.number().int().min(1).max(20).default(8),
});

/**
 * Schema for related products recommendations.
 */
export const relatedProductsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(30).default(8),
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
});

/**
 * Schema for general discovery feeds (Featured, Trending, New Arrivals).
 */
export const discoveryFeedQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(12),
    categoryId: z.string().uuid().optional(),
});

export type ProductSearchQueryInput = z.infer<typeof productSearchQuerySchema>;
export type SearchSuggestionsQueryInput = z.infer<typeof searchSuggestionsQuerySchema>;
export type RelatedProductsQueryInput = z.infer<typeof relatedProductsQuerySchema>;
export type DiscoveryFeedQueryInput = z.infer<typeof discoveryFeedQuerySchema>;

export type ProductSearchServiceInput = Partial<ProductSearchQueryInput>;
