/**
 * Swagger documentation schemas and tags for Search & Discovery endpoints.
 */
export const searchTags = [
    {
        name: "Search & Discovery",
        description: "🔍 PostgreSQL Full-Text Search, Faceted Filtering (Category, Brand, Price, Rating), Sorting, Autocomplete Suggestions, Featured Showcases, and Related Product Recommendations",
    },
];

export const searchSwaggerSchemas = {
    searchQuery: {
        type: "object",
        properties: {
            q: { type: "string", description: "Search query text matching product name, description, brand, category, or SKU" },
            categoryId: { type: "string", format: "uuid", description: "Filter by category ID (includes all child subcategories)" },
            categorySlug: { type: "string", description: "Filter by category slug" },
            brandId: { type: "string", format: "uuid", description: "Filter by brand ID" },
            brandSlug: { type: "string", description: "Filter by brand slug" },
            minPrice: { type: "number", minimum: 0, description: "Minimum price threshold across active variants" },
            maxPrice: { type: "number", minimum: 0, description: "Maximum price threshold across active variants" },
            minRating: { type: "integer", minimum: 1, maximum: 5, description: "Minimum average review star rating" },
            inStockOnly: { type: "boolean", description: "Filter only products with available physical inventory" },
            isFeatured: { type: "boolean", description: "Filter featured spotlight products" },
            sortBy: {
                type: "string",
                enum: ["relevance", "price_asc", "price_desc", "newest", "rating_desc", "popularity"],
                default: "relevance",
                description: "Sort ordering criteria",
            },
            page: { type: "integer", default: 1, minimum: 1 },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
    },

    suggestionsQuery: {
        type: "object",
        required: ["q"],
        properties: {
            q: { type: "string", description: "Typeahead search query" },
            limit: { type: "integer", default: 8, minimum: 1, maximum: 20 },
        },
    },

    relatedQuery: {
        type: "object",
        properties: {
            limit: { type: "integer", default: 8, minimum: 1, maximum: 30 },
        },
    },

    discoveryFeedQuery: {
        type: "object",
        properties: {
            limit: { type: "integer", default: 12, minimum: 1, maximum: 50 },
            categoryId: { type: "string", format: "uuid" },
        },
    },
};
