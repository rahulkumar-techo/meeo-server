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
                summary: "List categories with pagination, search, and parent filters",
            },
        },
        categoryController.listCategories.bind(categoryController),
    );

    app.get(
        "/tree",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "Get hierarchical category tree",
            },
        },
        categoryController.getCategoryTree.bind(categoryController),
    );

    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Categories"],
                summary: "Get category by ID",
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
                summary: "Get category by slug",
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
                summary: "Create a new category",
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
                summary: "Update category (Creator or User with category/product update permission)",
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
                summary: "Delete category (Creator or User with category/product delete permission)",
                security: [{ bearerAuth: [] }],
                params: catalogSchemas.categoryParams,
            },
        },
        categoryController.deleteCategory.bind(categoryController),
    );
}
