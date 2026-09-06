import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchService } from "@/modules/search/services/search.service.js";
import { DiscoveryService } from "@/modules/search/services/discovery.service.js";
import { prisma } from "@/lib/prisma.js";

vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        category: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        brand: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        product: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

describe("Search & Discovery Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("SearchService", () => {
        const searchService = new SearchService();

        it("searches products with multi-field matching, price range, and in-stock checks", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-1",
                    name: "Wireless Noise Cancelling Headphones",
                    slug: "wireless-headphones",
                    description: "High quality audio with active noise cancelling",
                    isFeatured: true,
                    images: [{ url: "https://cdn.example.com/headphones.jpg" }],
                    brand: { id: "b-1", name: "Sony", slug: "sony" },
                    category: { id: "c-1", name: "Audio", slug: "audio" },
                    variants: [
                        {
                            id: "v-1",
                            sku: "SONY-WH1000-BLK",
                            price: 299.99 as any,
                            compareAtPrice: 349.99 as any,
                            inventory: { availableQuantity: 15 },
                        },
                        {
                            id: "v-2",
                            sku: "SONY-WH1000-SLV",
                            price: 319.99 as any,
                            compareAtPrice: null,
                            inventory: { availableQuantity: 5 },
                        },
                    ],
                    reviews: [{ rating: 5 }, { rating: 4 }],
                    createdAt: new Date("2026-01-01"),
                },
                {
                    id: "p-2",
                    name: "Budget Bluetooth Earbuds",
                    slug: "budget-earbuds",
                    description: "Affordable wireless sound",
                    isFeatured: false,
                    images: [{ url: "https://cdn.example.com/earbuds.jpg" }],
                    brand: { id: "b-2", name: "Anker", slug: "anker" },
                    category: { id: "c-1", name: "Audio", slug: "audio" },
                    variants: [
                        {
                            id: "v-3",
                            sku: "ANKER-BUDS-1",
                            price: 49.99 as any,
                            compareAtPrice: null,
                            inventory: { availableQuantity: 0 }, // Out of stock
                        },
                    ],
                    reviews: [{ rating: 3 }],
                    createdAt: new Date("2026-02-01"),
                },
            ] as any);

            const result = await searchService.searchProducts({
                q: "headphones",
                minPrice: 50,
                maxPrice: 400,
                inStockOnly: true,
                sortBy: "price_asc",
                page: 1,
                limit: 10,
            });

            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.id).toBe("p-1");
            expect(result.items[0]!.startingPrice).toBe(299.99);
            expect(result.items[0]!.maxPrice).toBe(319.99);
            expect(result.items[0]!.totalStock).toBe(20);
            expect(result.items[0]!.inStock).toBe(true);
            expect(result.items[0]!.averageRating).toBe(4.5);
            expect(result.items[0]!.reviewCount).toBe(2);
            expect(result.pagination.total).toBe(1);
        });

        it("resolves category hierarchy recursively when filtering by category", async () => {
            // Parent: Electronics -> Children: Audio, Computers
            vi.mocked(prisma.category.findUnique).mockResolvedValue({ id: "cat-electronics" } as any);
            vi.mocked(prisma.category.findMany)
                .mockResolvedValueOnce([{ id: "cat-audio" }, { id: "cat-computers" }] as any) // Children of Electronics
                .mockResolvedValueOnce([]) // Children of Audio
                .mockResolvedValueOnce([]); // Children of Computers

            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-10",
                    name: "Laptop Pro",
                    slug: "laptop-pro",
                    description: "Fast computer",
                    isFeatured: true,
                    images: [],
                    brand: null,
                    category: { id: "cat-computers", name: "Computers", slug: "computers" },
                    variants: [
                        {
                            id: "v-10",
                            sku: "LAP-1",
                            price: 1200 as any,
                            compareAtPrice: null,
                            inventory: { availableQuantity: 8 },
                        },
                    ],
                    reviews: [],
                    createdAt: new Date(),
                },
            ] as any);

            const result = await searchService.searchProducts({
                categorySlug: "electronics",
            });

            expect(result.items).toHaveLength(1);
            expect(prisma.product.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        categoryId: { in: ["cat-electronics", "cat-audio", "cat-computers"] },
                    }),
                }),
            );
        });

        it("sorts by rating_desc and popularity correctly", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-a",
                    name: "Product A",
                    slug: "p-a",
                    variants: [{ price: 10 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [{ rating: 3 }, { rating: 3 }], // avg: 3.0, count: 2
                    images: [],
                    createdAt: new Date(),
                },
                {
                    id: "p-b",
                    name: "Product B",
                    slug: "p-b",
                    variants: [{ price: 20 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [{ rating: 5 }, { rating: 5 }, { rating: 5 }], // avg: 5.0, count: 3
                    images: [],
                    createdAt: new Date(),
                },
            ] as any);

            const ratingSorted = await searchService.searchProducts({ sortBy: "rating_desc" });
            expect(ratingSorted.items[0]!.id).toBe("p-b");
            expect(ratingSorted.items[0]!.averageRating).toBe(5.0);

            const popSorted = await searchService.searchProducts({ sortBy: "popularity" });
            expect(popSorted.items[0]!.id).toBe("p-b");
            expect(popSorted.items[0]!.reviewCount).toBe(3);
        });

        it("returns autocomplete search suggestions for search bar dropdowns", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-1",
                    name: "Nike Air Max",
                    slug: "nike-air-max",
                    images: [{ url: "https://img.com/nike.jpg" }],
                },
            ] as any);
            vi.mocked(prisma.brand.findMany).mockResolvedValue([
                { id: "b-1", name: "Nike", slug: "nike", _count: { products: 42 } },
            ] as any);
            vi.mocked(prisma.category.findMany).mockResolvedValue([
                { id: "c-1", name: "Air Shoes", slug: "air-shoes", _count: { products: 15 } },
            ] as any);

            const suggestions = await searchService.getSearchSuggestions({ q: "air", limit: 5 });

            expect(suggestions.query).toBe("air");
            expect(suggestions.products).toHaveLength(1);
            expect(suggestions.products[0]!.name).toBe("Nike Air Max");
            expect(suggestions.brands[0]!.name).toBe("Nike");
            expect(suggestions.categories[0]!.name).toBe("Air Shoes");
        });

        it("aggregates faceted search filters dynamically", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-1",
                    name: "Sneakers",
                    brand: { id: "b-1", name: "Nike", slug: "nike" },
                    category: { id: "c-1", name: "Shoes", slug: "shoes" },
                    variants: [{ price: 100 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [],
                    images: [],
                    createdAt: new Date(),
                },
                {
                    id: "p-2",
                    name: "Running Shoes",
                    brand: { id: "b-1", name: "Nike", slug: "nike" },
                    category: { id: "c-1", name: "Shoes", slug: "shoes" },
                    variants: [{ price: 150 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [],
                    images: [],
                    createdAt: new Date(),
                },
                {
                    id: "p-3",
                    name: "Track Pants",
                    brand: { id: "b-2", name: "Adidas", slug: "adidas" },
                    category: { id: "c-2", name: "Apparel", slug: "apparel" },
                    variants: [{ price: 60 as any, inventory: { availableQuantity: 2 } }],
                    reviews: [],
                    images: [],
                    createdAt: new Date(),
                },
            ] as any);

            const facets = await searchService.getFacetedFilters({ q: "shoes" });

            expect(facets.totalMatching).toBe(3);
            expect(facets.priceRange.min).toBe(60);
            expect(facets.priceRange.max).toBe(150);
            expect(facets.brands).toEqual([
                { id: "b-1", name: "Nike", slug: "nike", count: 2 },
                { id: "b-2", name: "Adidas", slug: "adidas", count: 1 },
            ]);
            expect(facets.categories).toEqual([
                { id: "c-1", name: "Shoes", slug: "shoes", count: 2 },
                { id: "c-2", name: "Apparel", slug: "apparel", count: 1 },
            ]);
        });
    });

    describe("DiscoveryService", () => {
        const discoveryService = new DiscoveryService();

        it("retrieves featured products with active status and starting prices", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-featured",
                    name: "Flagship Phone",
                    slug: "flagship-phone",
                    isFeatured: true,
                    images: [{ url: "https://img.com/phone.jpg" }],
                    brand: { id: "b-1", name: "Apple", slug: "apple" },
                    category: { id: "c-1", name: "Smartphones", slug: "smartphones" },
                    variants: [
                        { price: 999 as any, compareAtPrice: 1099 as any, inventory: { availableQuantity: 10 } },
                    ],
                    reviews: [{ rating: 5 }],
                    createdAt: new Date(),
                },
            ] as any);

            const featured = await discoveryService.getFeaturedProducts(5);

            expect(featured).toHaveLength(1);
            expect(featured[0]!.isFeatured).toBe(true);
            expect(featured[0]!.startingPrice).toBe(999);
            expect(prisma.product.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ status: "ACTIVE", isFeatured: true }),
                }),
            );
        });

        it("recommends related products while excluding the current target product", async () => {
            vi.mocked(prisma.product.findUnique).mockResolvedValue({
                id: "target-prod-1",
                name: "Sony Wireless Headphones",
                categoryId: "cat-audio",
                brandId: "brand-sony",
            } as any);

            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "related-prod-2",
                    name: "Sony Earbuds",
                    slug: "sony-earbuds",
                    categoryId: "cat-audio",
                    brandId: "brand-sony",
                    variants: [{ price: 120 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [{ rating: 4 }],
                    images: [],
                    createdAt: new Date(),
                },
            ] as any);

            const related = await discoveryService.getRelatedProducts("target-prod-1", 4);

            expect(related).toHaveLength(1);
            expect(related[0]!.id).toBe("related-prod-2");
            expect(prisma.product.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: "ACTIVE",
                        id: { not: "target-prod-1" },
                    }),
                }),
            );
        });

        it("retrieves new arrivals sorted by creation date", async () => {
            vi.mocked(prisma.product.findMany).mockResolvedValue([
                {
                    id: "p-new",
                    name: "Fresh Release",
                    slug: "fresh-release",
                    variants: [{ price: 50 as any, inventory: { availableQuantity: 5 } }],
                    reviews: [],
                    images: [],
                    createdAt: new Date(),
                },
            ] as any);

            const newArrivals = await discoveryService.getNewArrivals(6);

            expect(newArrivals).toHaveLength(1);
            expect(newArrivals[0]!.name).toBe("Fresh Release");
            expect(prisma.product.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { createdAt: "desc" },
                }),
            );
        });
    });
});
