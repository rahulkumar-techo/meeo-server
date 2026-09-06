import type { FastifyInstance } from "fastify";
import { searchController } from "../controller/search.controller.js";
import { searchSwaggerSchemas } from "@/common/docs/searchDocs.js";

/**
 * Registers Search routes under /api/search.
 */
export async function searchRouter(app: FastifyInstance) {
    app.get(
        "/",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Search products with multi-faceted filtering & sorting",
                description: "Performs full-text product search across names, descriptions, brands, categories, and SKUs with multi-attribute filtering (category hierarchy, brand, price min/max, star rating, in-stock), sorting, and pagination.",
                querystring: searchSwaggerSchemas.searchQuery,
            },
        },
        searchController.search.bind(searchController),
    );

    app.get(
        "/suggestions",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Autocomplete search suggestions",
                description: "Returns matching product titles, brand names, and category names with counts for interactive search bar dropdowns.",
                querystring: searchSwaggerSchemas.suggestionsQuery,
            },
        },
        searchController.getSuggestions.bind(searchController),
    );

    app.get(
        "/facets",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Faceted search aggregations",
                description: "Returns contextual facet filter counts (brands with product counts, categories with product counts, and price min/max range) for the current search criteria.",
                querystring: searchSwaggerSchemas.searchQuery,
            },
        },
        searchController.getFacets.bind(searchController),
    );
}

/**
 * Registers Discovery routes under /api/discovery.
 */
export async function discoveryRouter(app: FastifyInstance) {
    app.get(
        "/featured",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Featured spotlight products",
                description: "Retrieves curated spotlight and featured products for homepage banners and promotional showcases.",
                querystring: searchSwaggerSchemas.discoveryFeedQuery,
            },
        },
        searchController.getFeatured.bind(searchController),
    );

    app.get(
        "/related/:productId",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Contextual related product recommendations",
                description: "Recommends similar products matching category, brand, and keyword similarity while excluding the target product.",
                params: {
                    type: "object",
                    required: ["productId"],
                    properties: {
                        productId: { type: "string", format: "uuid" },
                    },
                },
                querystring: searchSwaggerSchemas.relatedQuery,
            },
        },
        searchController.getRelated.bind(searchController),
    );

    app.get(
        "/trending",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] Top-rated & trending products",
                description: "Retrieves popular, top-rated products ranked by review scores and volume.",
                querystring: searchSwaggerSchemas.discoveryFeedQuery,
            },
        },
        searchController.getTrending.bind(searchController),
    );

    app.get(
        "/new-arrivals",
        {
            schema: {
                tags: ["Search & Discovery"],
                summary: "[Public] New arrivals feed",
                description: "Retrieves newly added active products sorted by recency.",
                querystring: searchSwaggerSchemas.discoveryFeedQuery,
            },
        },
        searchController.getNewArrivals.bind(searchController),
    );
}
