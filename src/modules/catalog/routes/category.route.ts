import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { categoryController } from "../controller/category.controller.js";
import { catalogSchemas } from "@/common/docs/catalog.js";

/** Registers category routes under /categories. */
export default async function categoryRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Read Category Endpoints
    // ----------------------------------------------------
    app.get(
        "/",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Public] List categories",
                description: "Retrieve categories with pagination, search query, parent ID filter, and status filter. Public users only receive active categories.",
            },
        },
        categoryController.listCategories.bind(categoryController),
    );

    app.get(
        "/tree",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Public] Get category hierarchy tree",
                description: "Returns the complete hierarchical parent-child category tree for storefront navigation and catalog browsing.",
            },
        },
        categoryController.getCategoryTree.bind(categoryController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Public] Get category by ID",
                description: "Fetch single category details by UUID including parent category and direct children.",
                params: catalogSchemas.categoryParams,
            },
        },
        categoryController.getCategory.bind(categoryController),
    );

    app.get(
        "/slug/:slug",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Public] Get category by slug",
                description: "Fetch single category details by unique URL slug.",
                params: catalogSchemas.categorySlugParams,
            },
        },
        categoryController.getCategoryBySlug.bind(categoryController),
    );

    // ----------------------------------------------------
    // Authenticated / Management Category Endpoints
    // ----------------------------------------------------
    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requireAnyPermission([PERMISSIONS.CATEGORY_CREATE, PERMISSIONS.PRODUCT_CREATE]),
            ],
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Admin: category:create | product:create] Create category",
                description: "Create a new category. Requires `category:create` or `product:create` permission. Sets `createdById` to the authenticated user.",
                security: [{ bearerAuth: [] }],
                body: catalogSchemas.createCategory,
            },
        },
        categoryController.createCategory.bind(categoryController),
    );

    app.patch(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Creator OR Admin: category:update | product:update] Update category",
                description: "Update category name, slug, parent, description, image, or status. Permitted for the category creator OR users with `category:update`/`product:update` permission.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.categoryParams,
                body: catalogSchemas.updateCategory,
            },
        },
        categoryController.updateCategory.bind(categoryController),
    );

    app.delete(
        "/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["Catalog - Categories"],
                summary: "[Creator OR Admin: category:delete | product:delete] Delete category",
                description: "Delete category. Permitted for category creator OR users with `category:delete`/`product:delete` permission. Automatically reassigns child categories to the parent and prevents deletion if active products are attached.",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.categoryParams,
            },
        },
        categoryController.deleteCategory.bind(categoryController),
    );
}
