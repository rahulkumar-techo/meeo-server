import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "./permission.constants.js";
import { authorizationController } from "./authorization.controller.js";
import { userController } from "@/modules/user/controller/user.controller.js";
import { authController } from "@/modules/auth/auth.controller.js";
import { authorizationListResponse, authorizationResponse, authorizationSchemas, protectedSchema } from "@/common/docs/authorization.js";

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
            schema: protectedSchema(
                "[Admin: role:create] Create a role",
                "Create a new RBAC system role (e.g. MANAGER, SUPPORT). Requires `role:create` permission.",
                {
                    body: authorizationSchemas.role,
                    response: authorizationResponse(201, authorizationSchemas.roleResponse),
                },
            ),
        },
        authorizationController.createRole.bind(authorizationController),
    );
    app.get(
        "/roles",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema(
                "[Admin: role:read] List roles",
                "Retrieve all system roles and their assigned permissions. Requires `role:read` permission.",
                {
                    response: authorizationListResponse(authorizationSchemas.roleResponse),
                },
            ),
        },
        authorizationController.listRoles.bind(authorizationController),
    );
    app.get(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema(
                "[Admin: role:read] Get a role",
                "Retrieve role details and associated permissions by UUID. Requires `role:read` permission.",
                {
                    params: authorizationSchemas.roleParams,
                    response: authorizationResponse(200, authorizationSchemas.roleResponse),
                },
            ),
        },
        authorizationController.getRole.bind(authorizationController),
    );
    app.patch(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE),
            schema: protectedSchema(
                "[Admin: role:update] Update a role",
                "Update role name or description. System roles like SUPER_ADMIN cannot be renamed. Requires `role:update` permission.",
                {
                    params: authorizationSchemas.roleParams,
                    body: { ...authorizationSchemas.role, required: [] },
                    response: authorizationResponse(200, authorizationSchemas.roleResponse),
                },
            ),
        },
        authorizationController.updateRole.bind(authorizationController),
    );
    app.delete(
        "/roles/:roleId",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_DELETE),
            schema: protectedSchema(
                "[Admin: role:delete] Delete a role",
                "Delete a custom role. System roles and roles with active assigned users cannot be deleted. Requires `role:delete` permission.",
                {
                    params: authorizationSchemas.roleParams,
                    response: authorizationResponse(200, authorizationSchemas.deletedResponse),
                },
            ),
        },
        authorizationController.deleteRole.bind(authorizationController),
    );
    app.get(
        "/permissions",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_READ),
            schema: protectedSchema(
                "[Admin: role:read] List all permissions",
                "Retrieve all available system permissions for assigning to roles. Requires `role:read` permission.",
                {
                    response: authorizationListResponse(authorizationSchemas.permissionResponse),
                },
            ),
        },
        authorizationController.listPermissions.bind(authorizationController),
    );
    app.put(
        "/roles/:roleId/permissions",
        {
            preHandler: app.requirePermission(PERMISSIONS.ROLE_UPDATE),
            schema: protectedSchema(
                "[Admin: role:update] Replace role permissions",
                "Atomically replace the entire set of permissions granted to a role. Requires `role:update` permission.",
                {
                    params: authorizationSchemas.roleParams,
                    body: authorizationSchemas.permissionAssignment,
                    response: authorizationResponse(200, authorizationSchemas.roleResponse),
                },
            ),
        },
        authorizationController.replaceRolePermissions.bind(authorizationController),
    );
    app.put(
        "/users/:userId/roles",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema(
                "[Admin: user:update] Replace user roles",
                "Atomically assign or replace the roles granted to a target user. Requires `user:update` permission.",
                {
                    params: authorizationSchemas.userParams,
                    body: authorizationSchemas.roleAssignment,
                    response: authorizationResponse(200, { type: "array", items: authorizationSchemas.assignedRoleResponse }),
                },
            ),
        },
        authorizationController.replaceUserRoles.bind(authorizationController),
    );
    app.get(
        "/users",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: protectedSchema(
                "[Admin: user:read] List users",
                "Retrieve user accounts with their statuses and assigned roles. Requires `user:read` permission.",
                {
                    response: authorizationListResponse(authorizationSchemas.userResponse),
                },
            ),
        },
        userController.listUsers.bind(userController),
    );
    app.patch<{ Params: { userId: string } }>(
        "/users/:userId",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema(
                "[Admin: user:update] Update user status & details",
                "Update user status (ACTIVE, SUSPENDED, BLOCKED) or profile names. Requires `user:update` permission.",
                {
                    params: authorizationSchemas.userParams,
                    body: authorizationSchemas.userUpdate,
                    response: authorizationResponse(200, authorizationSchemas.userResponse),
                },
            ),
        },
        userController.updateUser.bind(userController),
    );
    app.get<{ Params: { userId: string } }>(
        "/users/:userId/sessions",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_READ),
            schema: protectedSchema(
                "[Admin: user:read] List user sessions",
                "List all active login sessions and device metadata for a specific user. Requires `user:read` permission.",
                {
                    params: authorizationSchemas.userParams,
                    response: authorizationListResponse(authorizationSchemas.sessionResponse),
                },
            ),
        },
        authController.listUserSessions.bind(authController),
    );
    app.delete<{ Params: { userId: string; sessionId: string } }>(
        "/users/:userId/sessions/:sessionId",
        {
            preHandler: app.requirePermission(PERMISSIONS.USER_UPDATE),
            schema: protectedSchema(
                "[Admin: user:update] Revoke user session",
                "Forcibly terminate and revoke an active session for any user. Requires `user:update` permission.",
                {
                    params: authorizationSchemas.sessionParams,
                    response: authorizationResponse(200, authorizationSchemas.revokedResponse),
                },
            ),
        },
        authController.revokeUserSession.bind(authController),
    );
};

export default authorizationRouter;