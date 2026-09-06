import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "perf-test-jwt-secret";

const { productServiceMock, categoryServiceMock, authPrismaMock } = vi.hoisted(() => ({
    productServiceMock: {
        listProducts: vi.fn(),
        getProductById: vi.fn(),
        getProductBySlug: vi.fn(),
        createProduct: vi.fn(),
        updateProduct: vi.fn(),
        deleteProduct: vi.fn(),
    },
    categoryServiceMock: {
        getCategoryTree: vi.fn(),
        getCategoryById: vi.fn(),
        getCategoryBySlug: vi.fn(),
        createCategory: vi.fn(),
        updateCategory: vi.fn(),
        deleteCategory: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/catalog/services/product.service.js", () => ({
    productService: productServiceMock,
}));
vi.mock("../modules/catalog/services/category.service.js", () => ({
    categoryService: categoryServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import productRouter from "../modules/catalog/routes/product.route.js";
import categoryRouter from "../modules/catalog/routes/category.route.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { encodeCursor } from "../common/utils/cursorPagination.js";

describe("Performance & Scalability Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(productRouter, { prefix: "/api/products" });
        await app.register(categoryRouter, { prefix: "/api/categories" });
        return app;
    };

    describe("Product Catalog Cursor Pagination", () => {
        it("supports cursor query parameter and returns compound pagination payload", async () => {
            const app = await createTestApp();
            const cursorVal = encodeCursor({ id: "cursor-id-123" });

            productServiceMock.listProducts.mockResolvedValue({
                items: [
                    { id: "prod-1", name: "Keyboard", slug: "keyboard" },
                    { id: "prod-2", name: "Mouse", slug: "mouse" },
                ],
                total: 2,
                page: 1,
                limit: 10,
                totalPages: 1,
                pageInfo: {
                    hasNextPage: true,
                    hasPreviousPage: false,
                    startCursor: encodeCursor({ id: "prod-1" }),
                    endCursor: encodeCursor({ id: "prod-2" }),
                    count: 2,
                },
            });

            const res = await app.inject({
                method: "GET",
                url: `/api/products?cursor=${cursorVal}&limit=10`,
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data.pageInfo.hasNextPage).toBe(true);
            expect(json.data.pageInfo.endCursor).toBeDefined();
            expect(productServiceMock.listProducts).toHaveBeenCalledWith(
                expect.objectContaining({
                    cursor: cursorVal,
                    limit: 10,
                }),
            );
        });
    });

    describe("Category Caching & Hierarchy Endpoints", () => {
        it("retrieves hierarchical category tree", async () => {
            const app = await createTestApp();

            categoryServiceMock.getCategoryTree.mockResolvedValue([
                {
                    id: "cat-electronics",
                    name: "Electronics",
                    slug: "electronics",
                    children: [
                        { id: "cat-phones", name: "Phones", slug: "phones", children: [] },
                    ],
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/categories/tree",
            });

            expect(res.statusCode).toBe(200);
            const json = res.json();
            expect(json.success).toBe(true);
            expect(json.data[0].id).toBe("cat-electronics");
            expect(json.data[0].children.length).toBe(1);
            expect(categoryServiceMock.getCategoryTree).toHaveBeenCalled();
        });
    });
});
