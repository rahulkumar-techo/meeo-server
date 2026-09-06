import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "search-test-jwt-secret";

const { searchServiceMock, discoveryServiceMock, authPrismaMock } = vi.hoisted(() => ({
    searchServiceMock: {
        searchProducts: vi.fn(),
        getSearchSuggestions: vi.fn(),
        getFacetedFilters: vi.fn(),
    },
    discoveryServiceMock: {
        getFeaturedProducts: vi.fn(),
        getRelatedProducts: vi.fn(),
        getTrendingProducts: vi.fn(),
        getNewArrivals: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/search/services/search.service.js", () => ({
    searchService: searchServiceMock,
}));
vi.mock("../modules/search/services/discovery.service.js", () => ({
    discoveryService: discoveryServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import { searchRouter, discoveryRouter } from "../modules/search/routes/search.route.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Search & Discovery HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(searchRouter, { prefix: "/api/search" });
        await app.register(discoveryRouter, { prefix: "/api/discovery" });
        return app;
    };

    it("publicly searches products via GET /api/search with query, filters, and sorting", async () => {
        const app = await createTestApp();

        searchServiceMock.searchProducts.mockResolvedValue({
            items: [
                {
                    id: "p-1",
                    name: "Running Shoes",
                    slug: "running-shoes",
                    startingPrice: 120,
                    maxPrice: 140,
                    inStock: true,
                    averageRating: 4.8,
                    reviewCount: 15,
                },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/search?q=running&minPrice=50&maxPrice=200&sortBy=price_asc&inStockOnly=true",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].startingPrice).toBe(120);
        expect(searchServiceMock.searchProducts).toHaveBeenCalledWith(
            expect.objectContaining({
                q: "running",
                minPrice: 50,
                maxPrice: 200,
                sortBy: "price_asc",
                inStockOnly: true,
            }),
        );
    });

    it("retrieves autocomplete suggestions via GET /api/search/suggestions", async () => {
        const app = await createTestApp();

        searchServiceMock.getSearchSuggestions.mockResolvedValue({
            query: "shoe",
            products: [{ id: "p-1", name: "Nike Shoe", slug: "nike-shoe" }],
            brands: [{ id: "b-1", name: "Nike", slug: "nike", productCount: 10 }],
            categories: [{ id: "c-1", name: "Shoes", slug: "shoes", productCount: 25 }],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/search/suggestions?q=shoe",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.products).toHaveLength(1);
        expect(searchServiceMock.getSearchSuggestions).toHaveBeenCalledWith({ q: "shoe", limit: 8 });
    });

    it("retrieves faceted search aggregations via GET /api/search/facets", async () => {
        const app = await createTestApp();

        searchServiceMock.getFacetedFilters.mockResolvedValue({
            totalMatching: 12,
            priceRange: { min: 25, max: 250 },
            brands: [{ id: "b-1", name: "Nike", slug: "nike", count: 8 }],
            categories: [{ id: "c-1", name: "Footwear", slug: "footwear", count: 12 }],
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/search/facets?q=nike",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.priceRange.min).toBe(25);
    });

    it("retrieves featured spotlight products via GET /api/discovery/featured", async () => {
        const app = await createTestApp();

        discoveryServiceMock.getFeaturedProducts.mockResolvedValue([
            {
                id: "p-feat-1",
                name: "Ultra Smartwatch",
                slug: "ultra-smartwatch",
                isFeatured: true,
                startingPrice: 399,
            },
        ]);

        const response = await app.inject({
            method: "GET",
            url: "/api/discovery/featured?limit=6",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data).toHaveLength(1);
        expect(discoveryServiceMock.getFeaturedProducts).toHaveBeenCalledWith(6, undefined);
    });

    it("retrieves related products for a product detail page via GET /api/discovery/related/:productId", async () => {
        const app = await createTestApp();
        const productId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        discoveryServiceMock.getRelatedProducts.mockResolvedValue([
            {
                id: "p-rel-1",
                name: "Matching Wireless Charger",
                slug: "wireless-charger",
                startingPrice: 49,
            },
        ]);

        const response = await app.inject({
            method: "GET",
            url: `/api/discovery/related/${productId}?limit=4`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data).toHaveLength(1);
        expect(discoveryServiceMock.getRelatedProducts).toHaveBeenCalledWith(productId, 4);
    });

    it("retrieves trending products via GET /api/discovery/trending", async () => {
        const app = await createTestApp();

        discoveryServiceMock.getTrendingProducts.mockResolvedValue([
            {
                id: "p-trend-1",
                name: "Top Seller",
                averageRating: 4.9,
                reviewCount: 150,
            },
        ]);

        const response = await app.inject({
            method: "GET",
            url: "/api/discovery/trending?limit=10",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data).toHaveLength(1);
        expect(discoveryServiceMock.getTrendingProducts).toHaveBeenCalledWith(10);
    });

    it("retrieves new arrivals via GET /api/discovery/new-arrivals", async () => {
        const app = await createTestApp();

        discoveryServiceMock.getNewArrivals.mockResolvedValue([
            {
                id: "p-new-1",
                name: "New Season Jacket",
                slug: "new-season-jacket",
            },
        ]);

        const response = await app.inject({
            method: "GET",
            url: "/api/discovery/new-arrivals?limit=8",
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data).toHaveLength(1);
        expect(discoveryServiceMock.getNewArrivals).toHaveBeenCalledWith(8, undefined);
    });
});
