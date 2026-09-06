import type { FastifyInstance } from "fastify";
import { productVariantController } from "../controller/productVariant.controller.js";
import { catalogSchemas } from "@/common/docs/catalog.js";

/**
 * Registers Product Variant routes under /variants and nested product variant operations.
 */
export default async function productVariantRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Read Variant Endpoints
    // ----------------------------------------------------
    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Public] Get variant by ID",
                description: "Fetch variant by UUID including parent product, dynamic attributes (Color, Size, etc.), and inventory stock.",
                params: catalogSchemas.variantParams,
            },
        },
        productVariantController.getVariantById.bind(productVariantController),
    );

    app.get(
        "/sku/:sku",
        {
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Public] Get variant by SKU",
                description: "Fetch variant by unique SKU barcode/identifier.",
                params: catalogSchemas.variantSkuParams,
            },
        },
        productVariantController.getVariantBySku.bind(productVariantController),
    );

    // ----------------------------------------------------
    // Authenticated / Management Variant Endpoints
    // ----------------------------------------------------
    app.patch(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Creator OR Admin: product:update] Update variant",
                description: "Update variant pricing (price, compareAtPrice, costPrice), SKU, barcode, status, or attributes. Permitted for product creator OR users with `product:update` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.variantParams,
                body: catalogSchemas.updateVariant,
            },
        },
        productVariantController.updateVariant.bind(productVariantController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Creator OR Admin: product:delete] Delete variant",
                description: "Delete product variant. Permitted for product creator OR users with `product:delete` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.variantParams,
            },
        },
        productVariantController.deleteVariant.bind(productVariantController),
    );
}

/**
 * Nested router for variants scoped under /products/:productId/variants
 */
export async function nestedProductVariantRouter(app: FastifyInstance) {
    app.get(
        "/:productId/variants",
        {
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Public] List product variants",
                description: "List all variants belonging to a specific product with pagination and status filter.",
                params: catalogSchemas.productVariantParams,
            },
        },
        productVariantController.listVariants.bind(productVariantController),
    );

    app.post(
        "/:productId/variants",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Creator OR Admin: product:update] Create product variant",
                description: "Create a single variant for a product with SKU, barcode, price, compareAtPrice, costPrice, attributes, and initial stock. Permitted for product creator OR users with `product:update` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productVariantParams,
                body: catalogSchemas.createVariant,
            },
        },
        productVariantController.createVariant.bind(productVariantController),
    );

    app.post(
        "/:productId/variants/batch",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Variants"],
                summary: "[Creator OR Admin: product:update] Batch create product variants",
                description: "Transactionally create multiple variants (e.g., Matrix of Sizes & Colors) for a product. Permitted for product creator OR users with `product:update` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productVariantParams,
                body: catalogSchemas.batchCreateVariants,
            },
        },
        productVariantController.batchCreateVariants.bind(productVariantController),
    );
}
