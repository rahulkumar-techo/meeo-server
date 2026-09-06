import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, imagekitMock } = vi.hoisted(() => ({
    prismaMock: {
        category: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        brand: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        product: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        productImage: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        productAttributeValue: {
            findMany: vi.fn(),
        },
        variantAttributeValue: {
            createMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        inventory: {
            create: vi.fn(),
            update: vi.fn(),
        },
        $transaction: vi.fn((callback: (tx: unknown) => unknown) => {
            if (typeof callback === "function") {
                return callback(prismaMock);
            }
            return Promise.all(callback);
        }),
    },
    imagekitMock: {
        uploadToImageKit: vi.fn(),
        deleteFromImageKit: vi.fn(),
        getImageKitAuthParams: vi.fn(),
    },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/imagekit.js", () => imagekitMock);

import { categoryService } from "../modules/catalog/services/category.service.js";
import { brandService } from "../modules/catalog/services/brand.service.js";
import { productService } from "../modules/catalog/services/product.service.js";
import { productVariantService } from "../modules/catalog/services/productVariant.service.js";
import { verifyCatalogOwnershipOrPermission } from "../modules/catalog/catalog-auth.helper.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "../plugins/auth.plugin.js";

describe("Catalog Services and Authorization Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==========================================
    // Authorization & Creator Ownership Tests
    // ==========================================
    describe("verifyCatalogOwnershipOrPermission", () => {
        const creatorUser: AuthorizationContext = {
            userId: "user-creator-123",
            id: "user-creator-123",
            email: "creator@example.com",
            roles: ["STAFF"],
            permissions: [],
        };

        const adminUser: AuthorizationContext = {
            userId: "admin-456",
            id: "admin-456",
            email: "admin@example.com",
            roles: ["ADMIN"],
            permissions: [PERMISSIONS.PRODUCT_DELETE, PERMISSIONS.PRODUCT_UPDATE],
        };

        const superAdminUser: AuthorizationContext = {
            userId: "super-789",
            id: "super-789",
            email: "super@example.com",
            roles: ["SUPER_ADMIN"],
            permissions: [PERMISSIONS.SYSTEM_MANAGE],
        };

        const unauthorizedUser: AuthorizationContext = {
            userId: "unauth-000",
            id: "unauth-000",
            email: "unauth@example.com",
            roles: ["CUSTOMER"],
            permissions: [],
        };

        it("allows the original creator to modify or delete their resource", () => {
            expect(() =>
                verifyCatalogOwnershipOrPermission("user-creator-123", creatorUser, PERMISSIONS.PRODUCT_DELETE),
            ).not.toThrow();
        });

        it("allows an admin possessing the required permission to modify or delete", () => {
            expect(() =>
                verifyCatalogOwnershipOrPermission("other-creator-id", adminUser, PERMISSIONS.PRODUCT_DELETE),
            ).not.toThrow();
        });

        it("allows SUPER_ADMIN with system:manage to bypass checks", () => {
            expect(() =>
                verifyCatalogOwnershipOrPermission("other-creator-id", superAdminUser, PERMISSIONS.PRODUCT_DELETE),
            ).not.toThrow();
        });

        it("rejects unauthorized non-creator without permission with 403", () => {
            expect(() =>
                verifyCatalogOwnershipOrPermission("other-creator-id", unauthorizedUser, PERMISSIONS.PRODUCT_DELETE),
            ).toThrowError("You do not have permission to modify or delete this resource");
        });
    });

    // ==========================================
    // Category Service Tests
    // ==========================================
    describe("CategoryService", () => {
        it("automatically generates slug from category name if omitted", async () => {
            prismaMock.category.findUnique.mockResolvedValue(null);
            prismaMock.category.create.mockResolvedValue({
                id: "cat-1",
                name: "Men's Footwear & Shoes",
                slug: "mens-footwear-shoes",
                parentId: null,
            });

            const result = await categoryService.createCategory(
                { name: "Men's Footwear & Shoes", status: "ACTIVE", sortOrder: 0 },
                "user-creator-123",
            );

            expect(result.slug).toBe("mens-footwear-shoes");
            expect(prismaMock.category.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: "Men's Footwear & Shoes",
                        slug: "mens-footwear-shoes",
                        createdById: "user-creator-123",
                    }),
                }),
            );
        });

        it("prevents duplicate category slugs", async () => {
            prismaMock.category.findUnique.mockResolvedValue({ id: "cat-existing", slug: "laptops" });

            await expect(
                categoryService.createCategory({ name: "Laptops", slug: "laptops", status: "ACTIVE", sortOrder: 0 }),
            ).rejects.toThrowError("A category with slug 'laptops' already exists");
        });

        it("prevents setting category as its own parent", async () => {
            prismaMock.category.findUnique.mockResolvedValue({
                id: "cat-1",
                name: "Electronics",
                slug: "electronics",
                createdById: "user-creator-123",
                parentId: null,
            });

            await expect(
                categoryService.updateCategory(
                    "cat-1",
                    { parentId: "cat-1" },
                    { userId: "user-creator-123", id: "user-creator-123", email: "a@a.com", roles: [], permissions: [] },
                ),
            ).rejects.toThrowError("A category cannot be its own parent");
        });

        it("builds a hierarchical nested category tree correctly", async () => {
            const mockCategories = [
                { id: "root-1", parentId: null, name: "Electronics", slug: "electronics", sortOrder: 1, status: "ACTIVE", description: null, imageUrl: null, createdAt: new Date(), updatedAt: new Date(), createdById: null },
                { id: "sub-1", parentId: "root-1", name: "Phones", slug: "phones", sortOrder: 1, status: "ACTIVE", description: null, imageUrl: null, createdAt: new Date(), updatedAt: new Date(), createdById: null },
                { id: "sub-2", parentId: "sub-1", name: "Smartphones", slug: "smartphones", sortOrder: 1, status: "ACTIVE", description: null, imageUrl: null, createdAt: new Date(), updatedAt: new Date(), createdById: null },
                { id: "root-2", parentId: null, name: "Apparel", slug: "apparel", sortOrder: 2, status: "ACTIVE", description: null, imageUrl: null, createdAt: new Date(), updatedAt: new Date(), createdById: null },
            ];

            prismaMock.category.findMany.mockResolvedValue(mockCategories);

            const tree = await categoryService.getCategoryTree();

            expect(tree).toHaveLength(2);
            expect(tree[0]?.name).toBe("Electronics");
            expect(tree[0]?.children).toHaveLength(1);
            expect(tree[0]?.children[0]?.name).toBe("Phones");
            expect(tree[0]?.children[0]?.children[0]?.name).toBe("Smartphones");
            expect(tree[1]?.name).toBe("Apparel");
            expect(tree[1]?.children).toHaveLength(0);
        });

        it("prevents deleting category when products are still assigned", async () => {
            prismaMock.category.findUnique.mockResolvedValue({
                id: "cat-1",
                name: "Laptops",
                createdById: "user-creator-123",
                _count: { products: 5, children: 0 },
            });

            await expect(
                categoryService.deleteCategory("cat-1", {
                    userId: "user-creator-123",
                    id: "user-creator-123",
                    email: "a@a.com",
                    roles: [],
                    permissions: [],
                }),
            ).rejects.toThrowError(/Cannot delete category with 5 associated product/);
        });
    });

    // ==========================================
    // Brand Service Tests
    // ==========================================
    describe("BrandService", () => {
        it("creates brand with auto-generated slug", async () => {
            prismaMock.brand.findUnique.mockResolvedValue(null);
            prismaMock.brand.create.mockResolvedValue({
                id: "brand-1",
                name: "Sony Electronics",
                slug: "sony-electronics",
                logoUrl: null,
            });

            const result = await brandService.createBrand({ name: "Sony Electronics", status: "ACTIVE" }, "user-1");

            expect(result.slug).toBe("sony-electronics");
            expect(prismaMock.brand.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: "Sony Electronics",
                        slug: "sony-electronics",
                        createdById: "user-1",
                    }),
                }),
            );
        });

        it("rejects deletion of brand with associated products", async () => {
            prismaMock.brand.findUnique.mockResolvedValue({
                id: "brand-1",
                name: "Sony",
                createdById: "user-1",
                _count: { products: 12 },
            });

            await expect(
                brandService.deleteBrand("brand-1", {
                    userId: "user-1",
                    id: "user-1",
                    email: "a@a.com",
                    roles: [],
                    permissions: [],
                }),
            ).rejects.toThrowError(/Cannot delete brand with 12 associated product/);
        });
    });

    // ==========================================
    // Product Service Tests
    // ==========================================
    describe("ProductService", () => {
        it("creates product in DRAFT status with SEO defaults and initial images", async () => {
            prismaMock.product.findUnique.mockResolvedValue(null);
            prismaMock.category.findUnique.mockResolvedValue({ id: "cat-1" });
            prismaMock.brand.findUnique.mockResolvedValue({ id: "brand-1" });
            prismaMock.product.create.mockResolvedValue({
                id: "prod-1",
                name: "MacBook Pro 16",
                slug: "macbook-pro-16",
                status: "DRAFT",
                seoTitle: "MacBook Pro 16",
                seoDescription: "M3 Max Chip Laptop",
                images: [{ id: "img-1", url: "https://example.com/macbook.jpg", sortOrder: 0 }],
            });

            const result = await productService.createProduct(
                {
                    name: "MacBook Pro 16",
                    description: "M3 Max Chip Laptop",
                    categoryId: "cat-1",
                    brandId: "brand-1",
                    status: "DRAFT",
                    isFeatured: false,
                    images: [{ url: "https://example.com/macbook.jpg", sortOrder: 0 }],
                },
                "user-1",
            );

            expect(result.status).toBe("DRAFT");
            expect(result.seoTitle).toBe("MacBook Pro 16");
            expect(prismaMock.product.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        name: "MacBook Pro 16",
                        slug: "macbook-pro-16",
                        status: "DRAFT",
                        createdById: "user-1",
                    }),
                }),
            );
        });

        it("transitions product lifecycle: publish, draft, archive", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: ["ADMIN"],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                name: "MacBook Pro",
                createdById: "user-1",
                status: "DRAFT",
            });

            prismaMock.product.update.mockResolvedValue({ id: "prod-1", status: "ACTIVE" });
            const published = await productService.publishProduct("prod-1", userContext);
            expect(published.status).toBe("ACTIVE");

            prismaMock.product.update.mockResolvedValue({ id: "prod-1", status: "ARCHIVED" });
            const archived = await productService.archiveProduct("prod-1", userContext);
            expect(archived.status).toBe("ARCHIVED");

            prismaMock.product.update.mockResolvedValue({ id: "prod-1", status: "DRAFT" });
            const drafted = await productService.draftProduct("prod-1", userContext);
            expect(drafted.status).toBe("DRAFT");
        });

        it("adds an image to a product with auto-incremented sortOrder", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
                images: [{ sortOrder: 2 }],
            });

            prismaMock.productImage.create.mockResolvedValue({
                id: "img-new",
                productId: "prod-1",
                url: "https://example.com/side.png",
                sortOrder: 3,
            });

            const result = await productService.addImage(
                "prod-1",
                { url: "https://example.com/side.png" },
                userContext,
            );

            expect(result.sortOrder).toBe(3);
            expect(prismaMock.productImage.create).toHaveBeenCalledWith({
                data: {
                    productId: "prod-1",
                    url: "https://example.com/side.png",
                    altText: null,
                    sortOrder: 3,
                    fileId: null,
                },
            });
        });

        it("uploads an image buffer to ImageKit and creates product image record", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
                images: [{ sortOrder: 0 }],
            });

            imagekitMock.uploadToImageKit.mockResolvedValue({
                fileId: "ik-file-123",
                url: "https://ik.imagekit.io/demo/products/prod-1/test.jpg",
                name: "test.jpg",
            });

            prismaMock.productImage.create.mockResolvedValue({
                id: "img-uploaded",
                productId: "prod-1",
                fileId: "ik-file-123",
                url: "https://ik.imagekit.io/demo/products/prod-1/test.jpg",
                altText: "Test image",
                sortOrder: 1,
            });

            const buffer = Buffer.from("fake-image-bytes");
            const result = await productService.uploadImage(
                "prod-1",
                buffer,
                "test.jpg",
                "Test image",
                undefined,
                "image/jpeg",
                userContext,
            );

            expect(imagekitMock.uploadToImageKit).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileName: "test.jpg",
                    folder: "/products/prod-1",
                }),
            );
            expect(result.fileId).toBe("ik-file-123");
            expect(result.sortOrder).toBe(1);
        });

        it("deletes product image and purges file from ImageKit when fileId exists", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
            });

            prismaMock.productImage.findFirst.mockResolvedValue({
                id: "img-1",
                productId: "prod-1",
                fileId: "ik-file-999",
                url: "https://ik.imagekit.io/demo/products/prod-1/img.jpg",
            });

            prismaMock.productImage.delete.mockResolvedValue({
                id: "img-1",
            });

            const result = await productService.deleteImage("prod-1", "img-1", userContext);

            expect(imagekitMock.deleteFromImageKit).toHaveBeenCalledWith("ik-file-999");
            expect(prismaMock.productImage.delete).toHaveBeenCalledWith({
                where: { id: "img-1" },
            });
            expect(result.deleted).toBe(true);
        });

        it("batch reorders product images transactionally", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
            });

            prismaMock.productImage.findMany.mockResolvedValue([
                { id: "img-1", productId: "prod-1", sortOrder: 0 },
                { id: "img-2", productId: "prod-1", sortOrder: 1 },
            ]);

            await productService.reorderImages(
                "prod-1",
                {
                    images: [
                        { id: "img-1", sortOrder: 1 },
                        { id: "img-2", sortOrder: 0 },
                    ],
                },
                userContext,
            );

            expect(prismaMock.$transaction).toHaveBeenCalled();
        });

        it("generates ImageKit client-side auth parameters for authenticated user", () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [],
            };

            imagekitMock.getImageKitAuthParams.mockReturnValue({
                token: "mock-token",
                expire: 1234567890,
                signature: "mock-signature",
                publicKey: "mock-pubkey",
                urlEndpoint: "https://ik.imagekit.io/demo",
            });

            const auth = productService.getImageKitAuth(userContext);
            expect(auth.token).toBe("mock-token");
            expect(auth.signature).toBe("mock-signature");
        });
    });

    // ==========================================
    // Product Variant Service Tests
    // ==========================================
    describe("ProductVariantService", () => {
        it("creates a product variant with SKU, pricing, and initial stock", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
            });

            prismaMock.productVariant.findUnique.mockResolvedValueOnce(null); // SKU doesn't exist yet
            prismaMock.productVariant.create.mockResolvedValue({
                id: "var-1",
                productId: "prod-1",
                sku: "PHONE-RED-64",
                barcode: "123456789012",
                price: 499.99,
                compareAtPrice: 599.99,
                costPrice: 350.00,
                status: "ACTIVE",
            });
            prismaMock.productVariant.findUnique.mockResolvedValueOnce({
                id: "var-1",
                productId: "prod-1",
                sku: "PHONE-RED-64",
                barcode: "123456789012",
                price: 499.99,
                compareAtPrice: 599.99,
                costPrice: 350.00,
                status: "ACTIVE",
                inventory: { availableQuantity: 50 },
            });

            const result = await productVariantService.createVariant(
                "prod-1",
                {
                    sku: "PHONE-RED-64",
                    barcode: "123456789012",
                    price: 499.99,
                    compareAtPrice: 599.99,
                    costPrice: 350.00,
                    status: "ACTIVE",
                    initialStock: 50,
                },
                userContext,
            );

            expect(result?.sku).toBe("PHONE-RED-64");
            expect(prismaMock.productVariant.create).toHaveBeenCalled();
            expect(prismaMock.inventory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    variantId: "var-1",
                    availableQuantity: 50,
                }),
            });
        });

        it("prevents creating variant with duplicate SKU", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
            });

            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: "var-existing",
                sku: "PHONE-RED-64",
            });

            await expect(
                productVariantService.createVariant(
                    "prod-1",
                    {
                        sku: "PHONE-RED-64",
                        price: 499.99,
                    },
                    userContext,
                ),
            ).rejects.toThrow("already exists");
        });

        it("retrieves variant by SKU code", async () => {
            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: "var-1",
                sku: "PHONE-RED-64",
                price: 499.99,
                product: { id: "prod-1", name: "Smartphone" },
            });

            const variant = await productVariantService.getVariantBySku("phone-red-64");
            expect(variant.sku).toBe("PHONE-RED-64");
            expect(prismaMock.productVariant.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { sku: "PHONE-RED-64" },
                }),
            );
        });

        it("updates variant pricing and attributes", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.productVariant.findUnique.mockResolvedValueOnce({
                id: "var-1",
                sku: "PHONE-RED-64",
                product: { createdById: "user-1" },
            });

            prismaMock.productVariant.update.mockResolvedValue({
                id: "var-1",
                price: 449.99,
            });

            prismaMock.productVariant.findUnique.mockResolvedValueOnce({
                id: "var-1",
                sku: "PHONE-RED-64",
                price: 449.99,
            });

            const updated = await productVariantService.updateVariant(
                "var-1",
                {
                    price: 449.99,
                },
                userContext,
            );

            expect(prismaMock.productVariant.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "var-1" },
                }),
            );
            expect(updated?.price).toBe(449.99);
        });

        it("deletes a variant successfully", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_DELETE],
            };

            prismaMock.productVariant.findUnique.mockResolvedValue({
                id: "var-1",
                productId: "prod-1",
                product: { createdById: "user-1" },
            });

            prismaMock.productVariant.delete.mockResolvedValue({
                id: "var-1",
            });

            const res = await productVariantService.deleteVariant("var-1", userContext);
            expect(res.deleted).toBe(true);
            expect(prismaMock.productVariant.delete).toHaveBeenCalledWith({
                where: { id: "var-1" },
            });
        });

        it("batch creates multiple variants for a product", async () => {
            const userContext: AuthorizationContext = {
                userId: "user-1",
                id: "user-1",
                email: "a@a.com",
                roles: [],
                permissions: [PERMISSIONS.PRODUCT_UPDATE],
            };

            prismaMock.product.findUnique.mockResolvedValue({
                id: "prod-1",
                createdById: "user-1",
            });

            prismaMock.productVariant.findMany.mockResolvedValueOnce([]); // No existing duplicates
            prismaMock.productVariant.create.mockResolvedValueOnce({ id: "var-1" });
            prismaMock.productVariant.create.mockResolvedValueOnce({ id: "var-2" });
            prismaMock.productVariant.findMany.mockResolvedValueOnce([
                { id: "var-1", sku: "TSHIRT-BLK-S", price: 29.99 },
                { id: "var-2", sku: "TSHIRT-BLK-M", price: 29.99 },
            ]);

            const res = await productVariantService.batchCreateVariants(
                "prod-1",
                {
                    variants: [
                        { sku: "TSHIRT-BLK-S", price: 29.99, initialStock: 10 },
                        { sku: "TSHIRT-BLK-M", price: 29.99, initialStock: 20 },
                    ],
                },
                userContext,
            );

            expect(res).toHaveLength(2);
            expect(prismaMock.productVariant.create).toHaveBeenCalledTimes(2);
        });
    });
});


