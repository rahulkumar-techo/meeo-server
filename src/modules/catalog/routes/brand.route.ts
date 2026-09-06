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
                summary: "[Public] List brands",
                description: "List all brands with pagination, search query, and status filter.",
            },
        },
        brandController.listBrands.bind(brandController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Brands"],
                summary: "[Public] Get brand by ID",
                description: "Retrieve a single brand by UUID with product counts.",
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
                summary: "[Public] Get brand by slug",
                description: "Retrieve a single brand by unique URL slug.",
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
                summary: "[Admin: brand:create | product:create] Create brand",
                description: "Create a new brand. Requires `brand:create` or `product:create` permission. Sets `createdById` to authenticated user.",
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
                summary: "[Creator OR Admin: brand:update | product:update] Update brand",
                description: "Update brand details (name, slug, logoUrl, status). Permitted for brand creator OR users with `brand:update`/`product:update` permission.",
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
                summary: "[Creator OR Admin: brand:delete | product:delete] Delete brand",
                description: "Delete brand. Permitted for brand creator OR users with `brand:delete`/`product:delete` permission. Blocked if active products belong to this brand.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.brandParams,
            },
        },
        brandController.deleteBrand.bind(brandController),
    );
}
