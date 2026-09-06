import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { productController } from "../controller/product.controller.js";
import { catalogSchemas } from "@/common/docs/catalog.js";

/** Registers product routes under /products. */
export default async function productRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Read Product Endpoints
    // ----------------------------------------------------
    app.get(
        "/",
        {
            schema: {
                tags: ["Catalog - Products"],
                summary: "List products with search, category, brand, and status filters",
            },
        },
        productController.listProducts.bind(productController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Products"],
                summary: "Get product by ID with category, brand, images, and variants",
                params: catalogSchemas.productParams,
            },
        },
        productController.getProduct.bind(productController),
    );

    app.get(
        "/slug/:slug",
        {
            schema: {
                tags: ["Catalog - Products"],
                summary: "Get product by slug",
                params: catalogSchemas.productSlugParams,
            },
        },
        productController.getProductBySlug.bind(productController),
    );

    // ----------------------------------------------------
    // Authenticated / Management Product Endpoints
    // ----------------------------------------------------
    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.PRODUCT_CREATE),
            ],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Create a new product (defaults to DRAFT)",
                security: [{ bearerAuth: [] }],
                body: catalogSchemas.createProduct,
            },
        },
        productController.createProduct.bind(productController),
    );

    app.patch(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Update product details and SEO fields (Creator or Admin with product:update)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
                body: catalogSchemas.updateProduct,
            },
        },
        productController.updateProduct.bind(productController),
    );

    app.post(
        "/:id/publish",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Publish a draft/archived product to ACTIVE status",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
            },
        },
        productController.publishProduct.bind(productController),
    );

    app.post(
        "/:id/draft",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Move a product back to DRAFT status",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
            },
        },
        productController.draftProduct.bind(productController),
    );

    app.post(
        "/:id/archive",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Archive a product",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
            },
        },
        productController.archiveProduct.bind(productController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Products"],
                summary: "Delete product (Creator or Admin with product:delete)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
            },
        },
        productController.deleteProduct.bind(productController),
    );

    // ----------------------------------------------------
    // Product Images Endpoints (ImageKit & Image Management)
    // ----------------------------------------------------
    app.get(
        "/images/auth",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Images"],
                summary: "Generate client-side ImageKit authentication tokens (signature, token, expire)",
                security: [{ bearerAuth: [] }],
            },
        },
        productController.getImageKitAuth.bind(productController),
    );

    app.post(
        "/:id/images/upload",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Images"],
                summary: "Upload image (file binary or base64/URL payload) to ImageKit and attach to product",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
                body: catalogSchemas.uploadImage,
            },
        },
        productController.uploadImage.bind(productController),
    );

    app.post(
        "/:id/images",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Images"],
                summary: "Add an image by URL to a product",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
                body: catalogSchemas.addImage,
            },
        },
        productController.addImage.bind(productController),
    );

    app.delete(
        "/:id/images/:imageId",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Images"],
                summary: "Delete an image from a product (and remove from ImageKit if tracked)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productImageParams,
            },
        },
        productController.deleteImage.bind(productController),
    );

    app.put(
        "/:id/images/reorder",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Images"],
                summary: "Reorder images for a product",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
                body: catalogSchemas.reorderImages,
            },
        },
        productController.reorderImages.bind(productController),
    );
}

