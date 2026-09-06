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
                summary: "[Public] List products",
                description: "List products with search, category, brand, and status filters. Public customers receive only ACTIVE products.",
            },
        },
        productController.listProducts.bind(productController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Products"],
                summary: "[Public] Get product by ID",
                description: "Fetch product by UUID including category, brand, images, and variants.",
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
                summary: "[Public] Get product by slug",
                description: "Fetch product by unique URL slug with relations.",
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
                summary: "[Admin: product:create] Create product",
                description: "Create a new product in DRAFT status. Requires `product:create` permission. Sets `createdById` to authenticated user.",
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
                summary: "[Creator OR Admin: product:update] Update product",
                description: "Update product title, description, category, brand, and SEO fields. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Publish product",
                description: "Transition product to ACTIVE status so it becomes visible on customer storefronts. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Move product to draft",
                description: "Revert product back to DRAFT status to hide from public browsing. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Archive product",
                description: "Move product to ARCHIVED status. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:delete] Delete product",
                description: "Permanently delete product and all associated variants and images. Permitted for product creator OR users with `product:delete` permission.",
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
                summary: "[Authenticated User] Get ImageKit client auth tokens",
                description: "Generates time-limited signature, token, and expire parameters for client-side direct uploads via ImageKit SDK.",
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
                summary: "[Creator OR Admin: product:update] Upload & attach product image",
                description: "Uploads an image (multipart file binary or base64/URL payload) to ImageKit and attaches it to the product with sort order. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Attach image URL to product",
                description: "Attaches an existing hosted image URL to the product. Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Delete product image",
                description: "Deletes an image from a product (and removes from ImageKit if tracked). Permitted for product creator OR users with `product:update` permission.",
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
                summary: "[Creator OR Admin: product:update] Reorder product images",
                description: "Reorders image gallery display sequence for a product. Permitted for product creator OR users with `product:update` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productParams,
                body: catalogSchemas.reorderImages,
            },
        },
        productController.reorderImages.bind(productController),
    );
}

