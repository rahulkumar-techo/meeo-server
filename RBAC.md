# RBAC Guide

This backend uses database-backed role-based access control inside the existing modular monolith.

## Model

```text
User -> UserRole -> Role -> RolePermission -> Permission
```

Users receive the union of permissions granted by all assigned roles. Permissions are loaded from PostgreSQL during authentication, deduplicated, and attached to the request context. They are not stored in the JWT.

## Permission constants

Use `src/modules/authorization/permission.constants.ts` instead of hardcoded permission strings. The special `system:manage` permission bypasses normal checks and is assigned to `SUPER_ADMIN` by the RBAC migration.

## Initial RBAC data

This repository does not run an application seed script. Create the system permissions, initial roles, and role-permission links through a controlled migration or an explicit administrative provisioning process before enabling protected admin routes.

## Authentication flow

1. `app.authenticate` verifies the Bearer JWT.
2. The current user is loaded and must have `ACTIVE` status.
3. If the token has a session ID, the session must exist, be unrevoked, and not be expired.
4. User roles and role permissions are loaded from the database.
5. The request context receives `id`, `userId`, `email`, `sessionId`, `roles`, and deduplicated `permissions`.

## Route guards

```ts
preHandler: app.requirePermission(PERMISSIONS.PRODUCT_CREATE)
preHandler: app.requireAnyPermission([
    PERMISSIONS.PRODUCT_UPDATE,
    PERMISSIONS.INVENTORY_UPDATE,
])
preHandler: app.requireAllPermissions([
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.PAYMENT_READ,
])
```

Authentication failures return `401`; authenticated users without the required permission receive `403`.

## Admin APIs

All endpoints require authentication and are protected by the listed permission:

| Method | Endpoint | Permission |
| --- | --- | --- |
| POST | `/api/v1/admin/roles` | `role:create` |
| GET | `/api/v1/admin/roles` | `role:read` |
| GET | `/api/v1/admin/roles/:roleId` | `role:read` |
| PATCH | `/api/v1/admin/roles/:roleId` | `role:update` |
| DELETE | `/api/v1/admin/roles/:roleId` | `role:delete` |
| GET | `/api/v1/admin/permissions` | `role:read` |
| PUT | `/api/v1/admin/roles/:roleId/permissions` | `role:update` |
| PUT | `/api/v1/admin/users/:userId/roles` | `user:update` |

Role and user-role replacement validates every referenced ID before changing links. The replacement and its `AuditLog` record run in one transaction, so invalid input cannot partially update permissions.

`SUPER_ADMIN` cannot be deleted. Ownership checks for customer resources remain separate from RBAC and must still compare the resource owner with `request.user.id`.
