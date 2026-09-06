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
                summary: "Get a product variant by ID with product, attributes, and stock",
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
                summary: "Get a product variant by unique SKU code",
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
                summary: "Update variant pricing, SKU, barcode, status, or attributes (Creator or Admin with product:update)",
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
                summary: "Delete a product variant (Creator or Admin with product:delete)",
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
                summary: "List all variants of a product with pagination and status filter",
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
                summary: "Create a new variant for a product with SKU, pricing, and initial stock",
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
                summary: "Batch create multiple variants for a product transactionally",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.productVariantParams,
                body: catalogSchemas.batchCreateVariants,
            },
        },
        productVariantController.batchCreateVariants.bind(productVariantController),
    );
}
