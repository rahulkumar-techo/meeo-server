# Role-Based Access Control (RBAC) & Authorization - Admin Guide

> **Base Route**: `/api/v1/admin`  
> **Route File**: [`src/modules/authorization/authorization.route.ts`](file:///e:/e-com/server/src/modules/authorization/authorization.route.ts)  
> **Controller**: [`src/modules/authorization/authorization.controller.ts`](file:///e:/e-com/server/src/modules/authorization/authorization.controller.ts)  
> **Service**: [`src/modules/authorization/authorization.service.ts`](file:///e:/e-com/server/src/modules/authorization/authorization.service.ts)  
> **Permission Catalog**: [`src/modules/authorization/permission.constants.ts`](file:///e:/e-com/server/src/modules/authorization/permission.constants.ts)  
> **Target Audience**: Security Administrators, Compliance Officers, IAM Engineers, Admin Dashboard Engineers

---

## Table of Contents

1. [RBAC Architecture & Security Invariants](#rbac-architecture--security-invariants)
2. [Granular Permissions Catalog](#granular-permissions-catalog)
3. [Admin Permissions & Route Guard Matrix](#admin-permissions--route-guard-matrix)
4. [Authorization Endpoints Summary](#authorization-endpoints-summary)
5. [Endpoint Specifications & Scenarios](#endpoint-specifications--scenarios)
   - [1. Create a System Role (`POST /roles`)](#1-create-a-system-role-post-roles)
   - [2. List All System Roles (`GET /roles`)](#2-list-all-system-roles-get-roles)
   - [3. Get Role Details & Permissions (`GET /roles/:roleId`)](#3-get-role-details--permissions-get-rolesroleid)
   - [4. Update Role Details (`PATCH /roles/:roleId`)](#4-update-role-details-patch-rolesroleid)
   - [5. Delete Custom Role (`DELETE /roles/:roleId`)](#5-delete-custom-role-delete-rolesroleid)
   - [6. List All Available Permissions (`GET /permissions`)](#6-list-all-available-permissions-get-permissions)
   - [7. Replace Role Permissions (`PUT /roles/:roleId/permissions`)](#7-replace-role-permissions-put-rolesroleidpermissions)
   - [8. Assign Roles to User (`PUT /users/:userId/roles`)](#8-assign-roles-to-user-put-usersuseridroles)
   - [9. List User Login Sessions (`GET /users/:userId/sessions`)](#9-list-user-login-sessions-get-usersuseridsessions)
   - [10. Revoke Active User Session (`DELETE /users/:userId/sessions/:sessionId`)](#10-revoke-active-user-session-delete-usersuseridsessionssessionid)
6. [Cache Invalidation & Real-Time Security Protocol](#cache-invalidation--real-time-security-protocol)
7. [Operational Error Codes Reference](#operational-error-codes-reference)

---

## RBAC Architecture & Security Invariants

The platform implements **Fine-Grained Role-Based Access Control (RBAC)** where capabilities are granted through explicit permissions rather than hardcoded role names.

```
┌────────────────────────────────────────────────────────┐
│                   Administrator User                   │
└───────────────────────────┬────────────────────────────┘
                            │ Has M:N Assigned Roles
                            ▼
┌────────────────────────────────────────────────────────┐
│              Role (e.g. "FINANCE_MANAGER")             │
└───────────────────────────┬────────────────────────────┘
                            │ Has M:N Assigned Permissions
                            ▼
┌────────────────────────────────────────────────────────┐
│   Granular Permission (e.g. "payment:refund")          │
└───────────────────────────┬────────────────────────────┘
                            │ Evaluated by Route Guard
                            ▼
┌────────────────────────────────────────────────────────┐
│   API Route (POST /api/v1/payments/refund)             │
└────────────────────────────────────────────────────────┘
```

### Key Security Invariants

- **SUPER_ADMIN Protection**: The `SUPER_ADMIN` role cannot be deleted or renamed.
- **Atomic Permission Swaps**: Role permission and user role assignments execute within ACID transactions (`prisma.$transaction`) to prevent partial or inconsistent privilege states.
- **Real-Time Token Cache Invalidation**: Whenever a user's roles or a role's permissions change, [`invalidateAuthContext(userId)`](file:///e:/e-com/server/src/common/utils/auth-cache.js) immediately flushes active session caches, taking effect within sub-seconds.
- **Mandatory Audit Trail**: Every role creation, update, deletion, permission assignment, and user role modification writes an immutable record to the `AuditLog` table.

---

## Granular Permissions Catalog

Permissions are defined in [`permission.constants.ts`](file:///e:/e-com/server/src/modules/authorization/permission.constants.ts):

| Domain | Permission Constant | Scope & Description |
|---|---|---|
| **Products & Catalog** | `product:read`<br>`product:create`<br>`product:update`<br>`product:delete` | Read catalog, create SKUs, edit variants, delete products |
| **Categories & Brands** | `category:read`, `category:create`, `category:update`, `category:delete`<br>`brand:read`, `brand:create`, `brand:update`, `brand:delete` | Manage taxonomic categories and brand registries |
| **Attributes** | `attribute:read`, `attribute:create`, `attribute:update`, `attribute:delete` | Manage product variant attributes (Size, Color, Material) |
| **Orders & Fulfillment**| `order:read`<br>`order:update`<br>`order:cancel` | View orders, update shipment tracking, cancel orders |
| **Inventory & Stock** | `inventory:read`<br>`inventory:update` | Inspect SKU stock levels, perform manual stock adjustments |
| **Finance & Payments** | `payment:read`<br>`payment:refund` | View transactions, reconcile gateway states, issue refunds |
| **Customers & Users** | `user:read`<br>`user:update` | View customer 360 profiles, suspend accounts, assign roles |
| **RBAC Administration** | `role:read`<br>`role:create`<br>`role:update`<br>`role:delete` | Inspect roles, create custom roles, assign permissions |
| **Marketing & Coupons** | `coupon:read`<br>`coupon:create`<br>`coupon:update`<br>`coupon:delete` | View analytics, create discount campaigns, toggle coupons |
| **Reviews & Moderation**| `review:read`<br>`review:moderate`<br>`review:delete` | Approve/reject customer reviews, resolve abuse reports |
| **Executive Analytics** | `dashboard:read` | View Net GMV Velocity, conversion funnel, revenue charts |
| **System & Compliance** | `audit:read`<br>`system:manage` | Inspect security audit trails, control background jobs |

---

## Admin Permissions & Route Guard Matrix

| Route Endpoint | Method | Guard Required |
|---|---|---|
| `/api/v1/admin/roles` | `POST` | `role:create` |
| `/api/v1/admin/roles` | `GET` | `role:read` |
| `/api/v1/admin/roles/:roleId` | `GET` | `role:read` |
| `/api/v1/admin/roles/:roleId` | `PATCH` | `role:update` |
| `/api/v1/admin/roles/:roleId` | `DELETE` | `role:delete` |
| `/api/v1/admin/permissions` | `GET` | `role:read` |
| `/api/v1/admin/roles/:roleId/permissions` | `PUT` | `role:update` |
| `/api/v1/admin/users/:userId/roles` | `PUT` | `user:update` |
| `/api/v1/admin/users/:userId/sessions` | `GET` | `user:read` |
| `/api/v1/admin/users/:userId/sessions/:sessionId` | `DELETE` | `user:update` |

---

## Authorization Endpoints Summary

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `POST` | `/api/v1/admin/roles` | `role:create` | Create a new RBAC system role |
| `GET` | `/api/v1/admin/roles` | `role:read` | List all roles with assigned permissions |
| `GET` | `/api/v1/admin/roles/:roleId` | `role:read` | Get role details and permissions by UUID |
| `PATCH`| `/api/v1/admin/roles/:roleId` | `role:update` | Update role name or description |
| `DELETE`| `/api/v1/admin/roles/:roleId` | `role:delete` | Delete custom role |
| `GET` | `/api/v1/admin/permissions` | `role:read` | List all system permissions |
| `PUT` | `/api/v1/admin/roles/:roleId/permissions` | `role:update` | Atomically replace role permissions |
| `PUT` | `/api/v1/admin/users/:userId/roles` | `user:update` | Atomically assign or replace user roles |
| `GET` | `/api/v1/admin/users/:userId/sessions` | `user:read` | View active login sessions for a user |
| `DELETE`| `/api/v1/admin/users/:userId/sessions/:sessionId` | `user:update` | Forcibly revoke a user login session |

---

## Endpoint Specifications & Scenarios

---

### 1. Create a System Role (`POST /roles`)

- **Method**: `POST`
- **URL**: `/api/v1/admin/roles`
- **Permission**: `role:create` or `SUPER_ADMIN`

#### Request Body
```json
{
  "name": "SUPPORT_LEAD",
  "description": "Customer support team lead with review moderation and order update access"
}
```

#### Scenarios

##### Scenario 1.A: Success (`201 Created`)
```json
{
  "status": "success",
  "data": {
    "id": "role-11111111-2222-3333-4444-555555555555",
    "name": "SUPPORT_LEAD",
    "description": "Customer support team lead with review moderation and order update access",
    "permissions": []
  }
}
```

---

### 2. List All System Roles (`GET /roles`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/roles`
- **Permission**: `role:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": [
    {
      "id": "role-super-admin",
      "name": "SUPER_ADMIN",
      "description": "Super administrator with all permissions",
      "permissions": [
        { "permission": { "id": "p-1", "name": "system:manage", "description": "System management" } }
      ]
    },
    {
      "id": "role-support-lead",
      "name": "SUPPORT_LEAD",
      "description": "Customer support team lead",
      "permissions": [
        { "permission": { "id": "p-2", "name": "order:read", "description": "View orders" } },
        { "permission": { "id": "p-3", "name": "order:update", "description": "Update orders" } },
        { "permission": { "id": "p-4", "name": "review:moderate", "description": "Moderate reviews" } }
      ]
    }
  ]
}
```

---

### 3. Replace Role Permissions (`PUT /roles/:roleId/permissions`)

Atomically replaces the entire set of permissions granted to a role and invalidates the session caches of all currently assigned users.

- **Method**: `PUT`
- **URL**: `/api/v1/admin/roles/:roleId/permissions`
- **Permission**: `role:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "permissionIds": [
    "p-order-read-uuid",
    "p-order-update-uuid",
    "p-review-moderate-uuid"
  ]
}
```

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "id": "role-support-lead",
    "name": "SUPPORT_LEAD",
    "permissions": [
      { "permission": { "id": "p-order-read-uuid", "name": "order:read" } },
      { "permission": { "id": "p-order-update-uuid", "name": "order:update" } },
      { "permission": { "id": "p-review-moderate-uuid", "name": "review:moderate" } }
    ]
  }
}
```

---

### 4. Assign Roles to User (`PUT /users/:userId/roles`)

Atomically assigns or replaces the roles for a user and immediately invalidates their active JWT session cache.

- **Method**: `PUT`
- **URL**: `/api/v1/admin/users/:userId/roles`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "roleIds": [
    "role-support-lead-uuid"
  ]
}
```

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": [
    {
      "id": "role-support-lead-uuid",
      "name": "SUPPORT_LEAD"
    }
  ]
}
```

---

### 5. Revoke Active User Session (`DELETE /users/:userId/sessions/:sessionId`)

Forcibly terminates an active login session, disconnecting the device immediately.

- **Method**: `DELETE`
- **URL**: `/api/v1/admin/users/:userId/sessions/:sessionId`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### Response (`200 OK`)
```json
{
  "status": "success",
  "message": "User session revoked successfully",
  "data": {
    "revoked": true,
    "sessionId": "sess-11111111-2222-3333-4444-555555555555"
  }
}
```

---

## Cache Invalidation & Real-Time Security Protocol

1. When `replaceRolePermissions()` or `replaceUserRoles()` executes, the service queries all affected `userId`s inside the database transaction.
2. Upon transaction commit, `invalidateAuthContext(userId)` is triggered across Redis and in-memory caches.
3. On the very next HTTP request from the affected user, the authentication middleware (`app.authenticate`) detects the cache bust and re-evaluates the fresh permissions directly from PostgreSQL.

---

## Operational Error Codes Reference

| HTTP Status | Error Reason | Explanation |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Malformed UUID or empty role name |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing or expired JWT Bearer token |
| `403 Forbidden` | `FORBIDDEN` | Missing required RBAC permission |
| `404 Not Found` | `ROLE_NOT_FOUND` | Role or permission UUID does not exist |
| `409 Conflict` | `PROTECTED_ROLE` | Attempting to delete or rename the `SUPER_ADMIN` role |
