import type { FastifyRequest, FastifyReply } from "fastify";
import { searchService } from "../services/search.service.js";
import { discoveryService } from "../services/discovery.service.js";
import {
    productSearchQuerySchema,
    searchSuggestionsQuerySchema,
    relatedProductsQuerySchema,
    discoveryFeedQuerySchema,
} from "../validations/search.validation.js";

export class SearchController {
    /**
     * Search products with multi-attribute filtering, dynamic price bounds, sorting, and pagination.
     */
    async search(req: FastifyRequest, reply: FastifyReply) {
        const query = productSearchQuerySchema.parse(req.query);
        const result = await searchService.searchProducts(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Autocomplete typeahead suggestions for search bars.
     */
    async getSuggestions(req: FastifyRequest, reply: FastifyReply) {
        const query = searchSuggestionsQuerySchema.parse(req.query);
        const result = await searchService.getSearchSuggestions(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Faceted search aggregations (available brands with counts, categories with counts, price min/max).
     */
    async getFacets(req: FastifyRequest, reply: FastifyReply) {
        const query = productSearchQuerySchema.parse(req.query);
        const result = await searchService.getFacetedFilters(query);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Showcase / featured products feed.
     */
    async getFeatured(req: FastifyRequest, reply: FastifyReply) {
        const query = discoveryFeedQuerySchema.parse(req.query);
        const result = await discoveryService.getFeaturedProducts(query.limit, query.categoryId);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Contextual related products for product details pages.
     */
    async getRelated(req: FastifyRequest, reply: FastifyReply) {
        const { productId } = req.params as { productId: string };
        const query = relatedProductsQuerySchema.parse(req.query);
        const result = await discoveryService.getRelatedProducts(productId, query.limit);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Top-rated & trending products feed.
     */
    async getTrending(req: FastifyRequest, reply: FastifyReply) {
        const query = discoveryFeedQuerySchema.parse(req.query);
        const result = await discoveryService.getTrendingProducts(query.limit);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * New arrivals discovery feed.
     */
    async getNewArrivals(req: FastifyRequest, reply: FastifyReply) {
        const query = discoveryFeedQuerySchema.parse(req.query);
        const result = await discoveryService.getNewArrivals(query.limit, query.categoryId);

        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }
}

export const searchController = new SearchController();
