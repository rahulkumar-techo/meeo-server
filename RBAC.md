# RBAC Guide

This guide explains role-based access control (RBAC) in this backend and shows how to configure it. It is written for API users and developers who add protected routes.

## 1. RBAC in simple terms

RBAC answers one question before a protected operation runs:

> Is this user allowed to perform this action?

This project uses four objects:

| Object | Meaning | Example |
| --- | --- | --- |
| User | A person who logs in | `admin@example.com` |
| Permission | One allowed action | `product:create` |
| Role | A named group of permissions | `PRODUCT_MANAGER` |
| Assignment | A link between records | Give `PRODUCT_MANAGER` to a user |

The relationship is:

```text
User -> UserRole -> Role -> RolePermission -> Permission
```

A user can have multiple roles. The user's effective permissions are the combined permissions from all assigned roles.

Example:

```text
PRODUCT_MANAGER -> product:read, product:create, product:update
INVENTORY_MANAGER -> inventory:read, inventory:update, product:read
```

A user with both roles can perform all five distinct actions. Assigning a role does not copy permissions into the user; permissions are read from the user's roles during authentication.

## 2. Permission naming

Permissions use the format:

```text
resource:action
```

Examples:

```text
product:read
product:create
order:update
payment:refund
user:update
```

Use the constants in `src/modules/authorization/permission.constants.ts` in application code instead of typing permission strings manually. The special `system:manage` permission bypasses normal permission checks and is assigned to `SUPER_ADMIN`.

## 3. Who can manage RBAC?

The authorization API is protected by permissions, not by a hardcoded role-name check:

| Operation | Required permission | `SUPER_ADMIN` | Seeded `ADMIN` |
| --- | --- | --- | --- |
| Create a role | `role:create` | Yes | No |
| View roles | `role:read` | Yes | Yes |
| View permissions | `role:read` | Yes | Yes |
| Update a role | `role:update` | Yes | Yes |
| Delete a role | `role:delete` | Yes | No |
| Assign permissions to a role | `role:update` | Yes | Yes |
| Assign roles to a user | `user:update` | Yes | Yes |
| Create a permission | No HTTP endpoint | SQL or migration | SQL or migration |

`SUPER_ADMIN` receives every seeded permission, including `system:manage`. The seeded `ADMIN` role receives only:

```text
user:read
user:update
role:read
role:update
audit:read
```

A normal `ADMIN` can manage existing role assignments but cannot create or delete roles. New permission records must currently be created by a database administrator or migration.

## 4. First-time setup

The RBAC migration creates the standard permissions, roles, and role-permission links. It does not create an application user.

### Step 1: Apply migrations

From the server directory:

```powershell
npm run prisma:deploy
```

### Step 2: Register a user

```http
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@example.com",
  "password": "StrongPass123"
}
```

Verify the email according to the normal authentication flow before using protected routes.

### Step 3: Assign `SUPER_ADMIN`

The seeded role IDs are deterministic:

| Role | ID |
| --- | --- |
| `SUPER_ADMIN` | `db8db01c-526c-24c4-94df-f3792fece1bf` |
| `ADMIN` | `192b193b-7862-0f34-55ef-0e4024e3d2d1` |

Run this in Neon. Replace the email with the exact value stored in `users`:

```sql
INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", 'db8db01c-526c-24c4-94df-f3792fece1bf'::uuid
FROM "users" u
WHERE u."email" = 'admin@example.com'
  AND EXISTS (
    SELECT 1 FROM "roles"
    WHERE "id" = 'db8db01c-526c-24c4-94df-f3792fece1bf'::uuid
  )
ON CONFLICT DO NOTHING;
```

The `EXISTS` condition prevents a link from being inserted when the role was not seeded. Verify the assignment:

```sql
SELECT u."id" AS "userId", u."email", r."id" AS "roleId", r."name"
FROM "users" u
JOIN "user_roles" ur ON ur."userId" = u."id"
JOIN "roles" r ON r."id" = ur."roleId"
WHERE u."email" = 'admin@example.com';
```

If no row is inserted, check the email and run `npm run prisma:deploy`. Log in again after assigning the role to receive a current token.

## 5. Create a role

There are two options.

### Option A: Admin API

Use an access token from a user with `role:create`, normally `SUPER_ADMIN`:

```http
POST /api/v1/admin/roles
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "CATALOG_MANAGER",
  "description": "Manages the product catalog"
}
```

Role names must contain only uppercase letters, numbers, and underscores. Save the returned role ID.

### Option B: SQL

```sql
INSERT INTO "roles" ("id", "name", "description", "updatedAt")
VALUES (
  gen_random_uuid(),
  'CATALOG_MANAGER',
  'Manages the product catalog',
  CURRENT_TIMESTAMP
)
RETURNING "id", "name";
```

The current schema requires an explicit role ID. If `gen_random_uuid()` is unavailable, use `uuid_generate_v4()` after enabling the `uuid-ossp` extension.

## 6. Find IDs

List roles and their permissions:

```http
GET /api/v1/admin/roles
Authorization: Bearer <access-token>
```

List available permissions:

```http
GET /api/v1/admin/permissions
Authorization: Bearer <access-token>
```

You need these IDs when using assignment endpoints.

## 7. Create a permission

There is currently no HTTP endpoint for creating permissions. Add one through a reviewed Prisma migration or directly in PostgreSQL:

```sql
INSERT INTO "permissions" ("id", "name", "description")
VALUES (
  gen_random_uuid(),
  'catalog:publish',
  'Publish catalog changes'
)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description"
RETURNING "id", "name";
```

For a permanent application permission, prefer a migration so every environment receives the same record. The current schema requires an explicit permission ID.

## 8. Assign permissions to a role

### Option A: Admin API

Use a token with `role:update`. This endpoint **replaces the complete permission list**, so include every permission the role should keep:

```http
PUT /api/v1/admin/roles/<role-id>/permissions
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "permissionIds": [
    "<product-read-permission-id>",
    "<product-update-permission-id>",
    "<catalog-publish-permission-id>"
  ]
}
```

Sending an empty array removes all permissions from the role. The API validates every ID and writes the replacement and audit record in one transaction.

### Option B: Add one permission with SQL

This keeps the role's existing permissions:

```sql
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT 'role-uuid'::uuid, p."id"
FROM "permissions" p
WHERE p."name" = 'catalog:publish'
ON CONFLICT DO NOTHING;
```

Replace `role-uuid` with the role ID returned by the role creation query.

## 9. Assign roles to a user

### Option A: Admin API

Use a token with `user:update`. This endpoint **replaces the user's complete role list**, so include every role the user should keep:

```http
PUT /api/v1/admin/users/<user-id>/roles
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "roleIds": [
    "<role-uuid>"
  ]
}
```

### Option B: Add one role with SQL

This keeps the user's existing roles:

```sql
INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", r."id"
FROM "users" u
CROSS JOIN "roles" r
WHERE u."email" = 'admin@example.com'
  AND r."name" = 'ADMIN'
ON CONFLICT DO NOTHING;
```

The user and role must already exist. Otherwise PostgreSQL will reject the foreign key or not-null constraint.

## 10. What happens during a request?

1. The user logs in and receives an access token.
2. `app.authenticate` validates the token and loads the current user.
3. The user must have `ACTIVE` status.
4. The server loads the user's roles and each role's permissions from PostgreSQL.
5. The server combines and deduplicates the permissions.
6. A route guard checks the required permission.
7. Missing authentication returns `401`; missing permission returns `403`.

Permissions are loaded during authentication and are not stored in the JWT. After changing roles or permissions, log in again or issue a new access token.

## 11. Protect a developer route

Use permission constants in route definitions:

```ts
preHandler: app.requirePermission(PERMISSIONS.PRODUCT_CREATE)
```

Require at least one permission:

```ts
preHandler: app.requireAnyPermission([
  PERMISSIONS.PRODUCT_UPDATE,
  PERMISSIONS.INVENTORY_UPDATE,
])
```

Require every listed permission:

```ts
preHandler: app.requireAllPermissions([
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.PAYMENT_READ,
])
```

Use `request.user.id` for ownership checks. RBAC answers whether a user has a capability; it does not replace checking whether the user owns a customer resource.

## 12. Admin API reference

All endpoints require a Bearer access token:

| Method | Endpoint | Required permission |
| --- | --- | --- |
| `POST` | `/api/v1/admin/roles` | `role:create` |
| `GET` | `/api/v1/admin/roles` | `role:read` |
| `GET` | `/api/v1/admin/roles/:roleId` | `role:read` |
| `PATCH` | `/api/v1/admin/roles/:roleId` | `role:update` |
| `DELETE` | `/api/v1/admin/roles/:roleId` | `role:delete` |
| `GET` | `/api/v1/admin/permissions` | `role:read` |
| `GET` | `/api/v1/admin/users` | `user:read` |
| `PATCH` | `/api/v1/admin/users/:userId` | `user:update` |
| `GET` | `/api/v1/admin/users/:userId/sessions` | `user:read` |
| `DELETE` | `/api/v1/admin/users/:userId/sessions/:sessionId` | `user:update` |
| `PUT` | `/api/v1/admin/roles/:roleId/permissions` | `role:update` |
| `PUT` | `/api/v1/admin/users/:userId/roles` | `user:update` |

`SUPER_ADMIN` cannot be deleted. Role and user-role replacement validates every referenced ID before changing links, and the replacement plus its `AuditLog` record run in one transaction.

### Suspend or block an account

Use the admin user update endpoint with a user ID:

```http
PATCH /api/v1/admin/users/<user-id>
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "status": "SUSPENDED"
}
```

Use `BLOCKED` for a permanently blocked account. Both statuses immediately revoke every active session for that user. The user cannot authenticate requests while the status is not `ACTIVE`.

To restore access:

```http
PATCH /api/v1/admin/users/<user-id>
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "status": "ACTIVE"
}
```

### Manage user sessions

When a user logs in, the server stores the optional `deviceName` and `deviceId` from the request, plus the request IP address and user-agent. Example login body:

```json
{
  "email": "admin@example.com",
  "password": "StrongPass123",
  "deviceName": "Rahul laptop",
  "deviceId": "browser-generated-device-id"
}
```

Users can list and revoke their own sessions:

```http
GET /api/auth/sessions
Authorization: Bearer <access-token>
```

```http
DELETE /api/auth/sessions/<session-id>
Authorization: Bearer <access-token>
```

To revoke every session for the current user and log out from all devices:

```http
POST /api/auth/logout-all
Authorization: Bearer <access-token>
```

Admins with the listed permissions can inspect or revoke another user's sessions using the admin endpoints. Session responses include device name, device ID, IP address, user-agent, creation time, last-used time, expiry, and revocation time. Refresh tokens are never returned.

## 13. Logout

Logout requires the current access token and revokes the session associated with that token. It also clears the refresh-token cookie:

```http
POST /api/auth/logout
Authorization: Bearer <access-token>
```

The access token is still cryptographically valid until it expires, but subsequent requests fail because its session has been revoked. Clients should remove the access token immediately after a successful logout.
