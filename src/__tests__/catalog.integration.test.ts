import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "catalog-test-jwt-secret";

const { categoryServiceMock, brandServiceMock, productServiceMock, authPrismaMock } = vi.hoisted(() => ({
    categoryServiceMock: {
        createCategory: vi.fn(),
        listCategories: vi.fn(),
        getCategoryTree: vi.fn(),
        getCategoryById: vi.fn(),
        getCategoryBySlug: vi.fn(),
        updateCategory: vi.fn(),
        deleteCategory: vi.fn(),
    },
    brandServiceMock: {
        createBrand: vi.fn(),
        listBrands: vi.fn(),
        getBrandById: vi.fn(),
        getBrandBySlug: vi.fn(),
        updateBrand: vi.fn(),
        deleteBrand: vi.fn(),
    },
    productServiceMock: {
        createProduct: vi.fn(),
        listProducts: vi.fn(),
        getProductById: vi.fn(),
        getProductBySlug: vi.fn(),
        updateProduct: vi.fn(),
        publishProduct: vi.fn(),
        draftProduct: vi.fn(),
        archiveProduct: vi.fn(),
        deleteProduct: vi.fn(),
        addImage: vi.fn(),
        deleteImage: vi.fn(),
        reorderImages: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/catalog/services/category.service.js", () => ({ categoryService: categoryServiceMock }));
vi.mock("../modules/catalog/services/brand.service.js", () => ({ brandService: brandServiceMock }));
vi.mock("../modules/catalog/services/product.service.js", () => ({ productService: productServiceMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import catalogRouter from "../modules/catalog/routes/catalog.route.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Catalog HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    async function createTestApp() {
        const app = Fastify();
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(catalogRouter, { prefix: "/api/v1" });
        app.setErrorHandler(errorHandler);
        return app;
    }

    function createAuthHeaders(roles: string[] = ["ADMIN"], permissions: string[] = [PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.PRODUCT_DELETE, PERMISSIONS.CATEGORY_CREATE, PERMISSIONS.CATEGORY_UPDATE, PERMISSIONS.CATEGORY_DELETE, PERMISSIONS.BRAND_CREATE, PERMISSIONS.BRAND_UPDATE, PERMISSIONS.BRAND_DELETE]) {
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: "user-admin-1",
            email: "admin@example.test",
            status: "ACTIVE",
            roles: roles.map((r) => ({
                role: {
                    name: r,
                    permissions: permissions.map((p) => ({ permission: { name: p } })),
                },
            })),
        });

        const token = generateAccessToken({ userId: "user-admin-1", email: "admin@example.test" });
        return { authorization: `Bearer ${token}` };
    }

    // ==========================================
    // Category Routes
    // ==========================================
    describe("Category Routes", () => {
        it("allows public access to list categories and category tree", async () => {
            categoryServiceMock.listCategories.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
            categoryServiceMock.getCategoryTree.mockResolvedValue([{ id: "cat-1", name: "Tech", children: [] }]);

            const app = await createTestApp();

            const listRes = await app.inject({ method: "GET", url: "/api/v1/categories" });
            expect(listRes.statusCode).toBe(200);

            const treeRes = await app.inject({ method: "GET", url: "/api/v1/categories/tree" });
            expect(treeRes.statusCode).toBe(200);
            expect(treeRes.json().data).toHaveLength(1);

            await app.close();
        });

        it("validates and creates category for authorized user", async () => {
            categoryServiceMock.createCategory.mockResolvedValue({
                id: "cat-1",
                name: "Smartphones",
                slug: "smartphones",
            });

            const app = await createTestApp();
            const headers = createAuthHeaders();

            const res = await app.inject({
                method: "POST",
                url: "/api/v1/categories",
                headers,
                payload: { name: "Smartphones" },
            });

            expect(res.statusCode).toBe(201);
            expect(categoryServiceMock.createCategory).toHaveBeenCalledWith(
                expect.objectContaining({ name: "Smartphones" }),
                "user-admin-1",
            );

            await app.close();
        });
    });

    // ==========================================
    // Brand Routes
    // ==========================================
    describe("Brand Routes", () => {
        it("creates brand with authorization headers", async () => {
            brandServiceMock.createBrand.mockResolvedValue({
                id: "brand-1",
                name: "Apple",
                slug: "apple",
            });

            const app = await createTestApp();
            const headers = createAuthHeaders();

            const res = await app.inject({
                method: "POST",
                url: "/api/v1/brands",
                headers,
                payload: { name: "Apple", logoUrl: "https://example.com/apple.png" },
            });

            expect(res.statusCode).toBe(201);
            expect(brandServiceMock.createBrand).toHaveBeenCalled();

            await app.close();
        });
    });

    // ==========================================
    // Product Routes & Image Management
    // ==========================================
    describe("Product Routes", () => {
        it("creates product in DRAFT and handles publish/archive actions", async () => {
            productServiceMock.createProduct.mockResolvedValue({
                id: "prod-1",
                name: "iPhone 16 Pro",
                status: "DRAFT",
            });
            productServiceMock.publishProduct.mockResolvedValue({
                id: "prod-1",
                name: "iPhone 16 Pro",
                status: "ACTIVE",
            });
            productServiceMock.archiveProduct.mockResolvedValue({
                id: "prod-1",
                name: "iPhone 16 Pro",
                status: "ARCHIVED",
            });

            const app = await createTestApp();
            const headers = createAuthHeaders();

            // 1. Create Product
            const createRes = await app.inject({
                method: "POST",
                url: "/api/v1/products",
                headers,
                payload: {
                    name: "iPhone 16 Pro",
                    description: "Apple iPhone 16 Pro Titanium",
                },
            });
            expect(createRes.statusCode).toBe(201);

            // 2. Publish Product
            const publishRes = await app.inject({
                method: "POST",
                url: "/api/v1/products/11111111-1111-1111-1111-111111111111/publish",
                headers,
            });
            expect(publishRes.statusCode).toBe(200);
            expect(publishRes.json().data.status).toBe("ACTIVE");

            // 3. Archive Product
            const archiveRes = await app.inject({
                method: "POST",
                url: "/api/v1/products/11111111-1111-1111-1111-111111111111/archive",
                headers,
            });
            expect(archiveRes.statusCode).toBe(200);
            expect(archiveRes.json().data.status).toBe("ARCHIVED");

            await app.close();
        });

        it("manages product images: add, reorder, delete", async () => {
            productServiceMock.addImage.mockResolvedValue({ id: "img-1", url: "https://example.com/iphone.png", sortOrder: 0 });
            productServiceMock.reorderImages.mockResolvedValue([{ id: "img-1", sortOrder: 1 }]);
            productServiceMock.deleteImage.mockResolvedValue({ id: "img-1", deleted: true });

            const app = await createTestApp();
            const headers = createAuthHeaders();

            // Add Image
            const addRes = await app.inject({
                method: "POST",
                url: "/api/v1/products/c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd/images",
                headers,
                payload: { url: "https://example.com/iphone.png" },
            });
            expect(addRes.statusCode).toBe(201);

            // Reorder Images
            const reorderRes = await app.inject({
                method: "PUT",
                url: "/api/v1/products/c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd/images/reorder",
                headers,
                payload: { images: [{ id: "e1234567-89ab-4cde-8f01-23456789abcd", sortOrder: 1 }] },
            });
            expect(reorderRes.statusCode).toBe(200);

            // Delete Image
            const deleteRes = await app.inject({
                method: "DELETE",
                url: "/api/v1/products/c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd/images/e1234567-89ab-4cde-8f01-23456789abcd",
                headers,
            });
            expect(deleteRes.statusCode).toBe(200);

            await app.close();
        });
    });
});
