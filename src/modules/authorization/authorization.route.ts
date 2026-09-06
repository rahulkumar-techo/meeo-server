import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "./permission.constants.js";
import { authorizationController } from "./authorization.controller.js";
import { userController } from "@/modules/user/controller/user.controller.js";
import { authController } from "@/modules/auth/auth.controller.js";
import { authorizationErrors, authorizationSchemas, protectedSchema } from "@/common/docs/authorization.js";

/** Registers role and permission administration routes under the admin API prefix. */
const authorizationRouter = (app: FastifyInstance) => {
    // This hook authenticates every request in this router before route-specific authorization runs.
    // It loads the user's roles and permissions into request.user for the permission guards below.
    app.addHook("preHandler", app.authenticate);

    // Role administration is permission-based rather than role-name-based.
    // Each route guard checks the minimum capability needed for that operation.
    app.post(
        "/roles",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_CREATE),
            schema: protectedSchema("Create a role", {
                body: authorizationSchemas.role,
                response: { 201: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.createRole.bind(authorizationController),
    );
    app.get(
        "/roles",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema("List roles", {
                response: { 200: { type: "array", items: authorizationSchemas.roleResponse }, ...authorizationErrors },
            }),
        },
        authorizationController.listRoles.bind(authorizationController),
    );
    app.get(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema("Get a role", {
                params: authorizationSchemas.roleParams,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.getRole.bind(authorizationController),
    );
    app.patch(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE),
            schema: protectedSchema("Update a role", {
                params: authorizationSchemas.roleParams,
                body: { ...authorizationSchemas.role, required: [] },
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.updateRole.bind(authorizationController),
    );
    app.delete(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_DELETE),
            schema: protectedSchema("Delete a role", {
                params: authorizationSchemas.roleParams,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.deleteRole.bind(authorizationController),
    );
    app.get(
        "/permissions",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema("List permissions", {
                response: { 200: { type: "array", items: { type: "object" } }, ...authorizationErrors },
            }),
        },
        authorizationController.listPermissions.bind(authorizationController),
    );
    app.put(
        "/roles/:roleId/permissions",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE),
            schema: protectedSchema("Replace role permissions", {
                params: authorizationSchemas.roleParams,
                body: authorizationSchemas.permissionAssignment,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.replaceRolePermissions.bind(authorizationController),
    );
    app.put(
        "/users/:userId/roles",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema("Replace user roles", {
                params: authorizationSchemas.userParams,
                body: authorizationSchemas.roleAssignment,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authorizationController.replaceUserRoles.bind(authorizationController),
    );
    app.get(
        "/users",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: protectedSchema("List users", {
                response: { 200: { type: "array", items: { type: "object" } }, ...authorizationErrors },
            }),
        },
        userController.listUsers.bind(userController),
    );
    app.patch<{ Params: { userId: string } }>(
        "/users/:userId",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema("Update a user", {
                params: authorizationSchemas.userParams,
                body: authorizationSchemas.userUpdate,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        userController.updateUser.bind(userController),
    );
    app.get<{ Params: { userId: string } }>(
        "/users/:userId/sessions",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: protectedSchema("List user sessions", {
                params: authorizationSchemas.userParams,
                response: { 200: { type: "array", items: { type: "object" } }, ...authorizationErrors },
            }),
        },
        authController.listUserSessions.bind(authController),
    );
    app.delete<{ Params: { userId: string; sessionId: string } }>(
        "/users/:userId/sessions/:sessionId",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema("Revoke a user session", {
                params: authorizationSchemas.sessionParams,
                response: { 200: { type: "object" }, ...authorizationErrors },
            }),
        },
        authController.revokeUserSession.bind(authController),
    );
};

export default authorizationRouter;