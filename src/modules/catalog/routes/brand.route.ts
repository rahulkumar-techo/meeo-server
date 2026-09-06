import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { brandController } from "../controller/brand.controller.js";
import { catalogSchemas } from "@/common/docs/catalog.js";

/** Registers brand routes under /brands. */
export default async function brandRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Read Brand Endpoints
    // ----------------------------------------------------
    app.get(
        "/",
        {
            schema: {
                tags: ["Catalog - Brands"],
                summary: "List brands with pagination and search",
            },
        },
        brandController.listBrands.bind(brandController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Brands"],
                summary: "Get brand by ID",
                params: catalogSchemas.brandParams,
            },
        },
        brandController.getBrand.bind(brandController),
    );

    app.get(
        "/slug/:slug",
        {
            schema: {
                tags: ["Catalog - Brands"],
                summary: "Get brand by slug",
                params: catalogSchemas.brandSlugParams,
            },
        },
        brandController.getBrandBySlug.bind(brandController),
    );

    // ----------------------------------------------------
    // Authenticated / Management Brand Endpoints
    // ----------------------------------------------------
    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requireAnyPermission([PERMISSIONS.BRAND_CREATE, PERMISSIONS.PRODUCT_CREATE]),
            ],
            schema: {
                tags: ["Catalog - Brands"],
                summary: "Create a new brand",
                security: [{ bearerAuth: [] }],
                body: catalogSchemas.createBrand,
            },
        },
        brandController.createBrand.bind(brandController),
    );

    app.patch(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Brands"],
                summary: "Update brand (Creator or User with brand/product update permission)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.brandParams,
                body: catalogSchemas.updateBrand,
            },
        },
        brandController.updateBrand.bind(brandController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Brands"],
                summary: "Delete brand (Creator or User with brand/product delete permission)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.brandParams,
            },
        },
        brandController.deleteBrand.bind(brandController),
    );
}
