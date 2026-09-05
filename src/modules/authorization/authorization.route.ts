import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "./permission.constants.js";
import { authorizationController } from "./authorization.controller.js";
import { errorResponse, successResponse } from "@/common/docs/swagger.js";

const roleBody = {
    type: "object",
    required: ["name"],
    properties: {
        name: { type: "string", pattern: "^[A-Z0-9_]+$" },
        description: { type: "string" },
    },
};

const roleParams = {
    type: "object",
    required: ["roleId"],
    properties: { roleId: { type: "string", format: "uuid" } },
};

const userParams = {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "string", format: "uuid" } },
};

const roleResponse = {
    type: "object",
    properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: ["string", "null"] },
        permissions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    permission: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                            description: { type: ["string", "null"] },
                        },
                    },
                },
            },
        },
    },
};

const permissionAssignmentBody = {
    type: "object",
    required: ["permissionIds"],
    properties: { permissionIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 100 } },
};

const roleAssignmentBody = {
    type: "object",
    required: ["roleIds"],
    properties: { roleIds: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 50 } },
};

/** Builds the shared OpenAPI metadata for authenticated authorization endpoints. */
const protectedSchema = (summary: string, extra: Record<string, unknown> = {}) => ({
    tags: ["Authorization"],
    summary,
    security: [{ bearerAuth: [] }],
    ...extra,
});

const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };

/** Registers role and permission administration routes under the admin API prefix. */
const authorizationRouter = (app: FastifyInstance) => {
    // The plugin authenticates first; each endpoint then applies its least-privilege permission.
    app.addHook("preHandler", app.authenticate);

    // Role administration is intentionally permission-based rather than role-name-based.
    app.post("/roles", { preHandler: app.requirePermission(PERMISSIONS.ROLE_CREATE), schema: protectedSchema("Create a role", { body: roleBody, response: { 201: successResponse(roleResponse), ...errors } }) }, authorizationController.createRole.bind(authorizationController));
    app.get("/roles", { preHandler: app.requirePermission(PERMISSIONS.ROLE_READ), schema: protectedSchema("List roles", { response: { 200: successResponse({ type: "array", items: roleResponse }), ...errors } }) }, authorizationController.listRoles.bind(authorizationController));
    app.get("/roles/:roleId", { preHandler: app.requirePermission(PERMISSIONS.ROLE_READ), schema: protectedSchema("Get a role", { params: roleParams, response: { 200: successResponse(roleResponse), ...errors } }) }, authorizationController.getRole.bind(authorizationController));
    app.patch("/roles/:roleId", { preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE), schema: protectedSchema("Update a role", { params: roleParams, body: { ...roleBody, required: [] }, response: { 200: successResponse(roleResponse), ...errors } }) }, authorizationController.updateRole.bind(authorizationController));
    app.delete("/roles/:roleId", { preHandler: app.requirePermission(PERMISSIONS.ROLE_DELETE), schema: protectedSchema("Delete a role", { params: roleParams, response: { 200: successResponse(), ...errors } }) }, authorizationController.deleteRole.bind(authorizationController));
    app.get("/permissions", { preHandler: app.requirePermission(PERMISSIONS.ROLE_READ), schema: protectedSchema("List permissions", { response: { 200: successResponse({ type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] } } } }), ...errors } }) }, authorizationController.listPermissions.bind(authorizationController));
    app.put("/roles/:roleId/permissions", { preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE), schema: protectedSchema("Replace role permissions", { params: roleParams, body: permissionAssignmentBody, response: { 200: successResponse(roleResponse), ...errors } }) }, authorizationController.replaceRolePermissions.bind(authorizationController));
    app.put("/users/:userId/roles", { preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE), schema: protectedSchema("Replace user roles", { params: userParams, body: roleAssignmentBody, response: { 200: successResponse({ type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } } }), ...errors } }) }, authorizationController.replaceUserRoles.bind(authorizationController));
};

export default authorizationRouter;