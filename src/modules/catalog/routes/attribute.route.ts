import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import { attributeController } from "../controller/attribute.controller.js";

/**
 * Registers Master Product Attribute routes under /attributes.
 * Base Path: /api/v1/attributes
 */
export default async function attributeRouter(app: FastifyInstance) {
    /**
     * GET /api/v1/attributes
     * [Public] List all attributes with their values.
     */
    app.get(
        "/",
        {
            schema: {
                tags: ["Catalog - Attributes"],
                summary: "[Public] List master attributes",
                description: "List all product attributes with pagination, search query, and nested values.",
            },
        },
        attributeController.listAttributes.bind(attributeController),
    );

    /**
     * GET /api/v1/attributes/:id
     * [Public] Get a single attribute by UUID with all its values.
     */
    app.get(
        "/:id",
        {
            schema: {
                tags: ["Catalog - Attributes"],
                summary: "[Public] Get attribute by ID",
                description: "Retrieve a single attribute by UUID with all its possible values.",
            },
        },
        attributeController.getAttribute.bind(attributeController),
    );

    /**
     * POST /api/v1/attributes
     * [Admin: attribute:create] Create a new attribute with optional initial values.
     * Body Example: { "name": "Color", "values": ["Red", "Blue", "Black"] }
     */
    app.post(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requireAnyPermission([PERMISSIONS.ATTRIBUTE_CREATE, PERMISSIONS.PRODUCT_CREATE]),
            ],
            schema: {
                tags: ["Catalog - Attributes"],
                summary: "[Admin: attribute:create] Create master attribute",
                description: "Create a master attribute with optional initial values.",
                security: [{ bearerAuth: [] }],
            },
        },
        attributeController.createAttribute.bind(attributeController),
    );

    /**
     * PATCH /api/v1/attributes/:id
     * [Admin: attribute:update] Update attribute name and/or add new values.
     * Body Example: { "name": "Primary Color", "values": ["Purple", "Green"] }
     */
    app.patch(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requireAnyPermission([PERMISSIONS.ATTRIBUTE_UPDATE, PERMISSIONS.PRODUCT_UPDATE]),
            ],
            schema: {
                tags: ["Catalog - Attributes"],
                summary: "[Admin: attribute:update] Update attribute name or values",
                description: "Update attribute name or append new values.",
                security: [{ bearerAuth: [] }],
            },
        },
        attributeController.updateAttribute.bind(attributeController),
    );

    /**
     * DELETE /api/v1/attributes/:id
     * [Admin: attribute:delete] Delete a master attribute and cascade to values and variant mappings.
     */
    app.delete(
        "/:id",
        {
            preHandler: [
                app.authenticate,
                app.requireAnyPermission([PERMISSIONS.ATTRIBUTE_DELETE, PERMISSIONS.PRODUCT_DELETE]),
            ],
            schema: {
                tags: ["Catalog - Attributes"],
                summary: "[Admin: attribute:delete] Delete attribute",
                description: "Permanently delete a master attribute and all its associated values.",
                security: [{ bearerAuth: [] }],
            },
        },
        attributeController.deleteAttribute.bind(attributeController),
    );
}
