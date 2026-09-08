# Coupons & Promotional Campaigns - Admin API Documentation

> **Base Route**: `/api/v1/coupons`  
> **Route File**: [`src/modules/coupons/routes/coupon.route.ts`](file:///e:/e-com/server/src/modules/coupons/routes/coupon.route.ts)  
> **Controller**: [`src/modules/coupons/controller/coupon.controller.ts`](file:///e:/e-com/server/src/modules/coupons/controller/coupon.controller.ts)  
> **Services**: [`src/modules/coupons/services/`](file:///e:/e-com/server/src/modules/coupons/services/)  
> **Validations**: [`src/modules/coupons/validations/coupon.validation.ts`](file:///e:/e-com/server/src/modules/coupons/validations/coupon.validation.ts)  
> **Target Audience**: Marketing Managers, Growth Teams, Finance Operations, Admin Dashboard Developers

---

## Table of Contents

1. [Promotions Architecture & Discount Rules Engine](#promotions-architecture--discount-rules-engine)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Discount Types & Calculation Rules](#discount-types--calculation-rules)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List All Promotional Coupons (`GET /`)](#1-list-all-promotional-coupons-get-)
   - [2. Get Promotion Analytics & Performance Metrics (`GET /metrics`)](#2-get-promotion-analytics--performance-metrics-get-metrics)
   - [3. Get Coupon Details with Recent Usages (`GET /:id`)](#3-get-coupon-details-with-recent-usages-get-id)
   - [4. Create Promotional Coupon (`POST /`)](#4-create-promotional-coupon-post-)
   - [5. Update Existing Coupon (`PUT /:id`)](#5-update-existing-coupon-put-id)
   - [6. Toggle Coupon Status (`PATCH /:id/status`)](#6-toggle-coupon-status-patch-idstatus)
   - [7. Delete or Archive Coupon (`DELETE /:id`)](#7-delete-or-archive-coupon-delete-id)
   - [8. List Coupon Redemption Audit Log (`GET /:id/usages`)](#8-list-coupon-redemption-audit-log-get-idusages)
6. [Audit Safety & Financial Integrity Rules](#audit-safety--financial-integrity-rules)
7. [Error Codes & Diagnostics Reference](#error-codes--diagnostics-reference)

---

## Promotions Architecture & Discount Rules Engine

```
                          ┌──────────────────────────┐
                          │   Coupon Rules Engine    │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
  │   PERCENTAGE    │          │  FIXED_AMOUNT   │          │  FREE_SHIPPING  │
  │  (1% to 100%)   │          │ (e.g. $15 off)  │          │ ($0 shipping)   │
  │ + Optional Cap  │          │   capped at     │          │                 │
  │ (maxDiscount)   │          │    subtotal     │          │                 │
  └────────┬────────┘          └────────┬────────┘          └────────┬────────┘
           │                            │                            │
           └────────────────────────────┼────────────────────────────┘
                                        │
                         Constraint Validation Pipeline
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
   Active Date Range           Minimum Subtotal             Usage Limits
  (startsAt / expiresAt)     (minimumOrderAmount)      (Global & Per-User)
```

### Key Business Invariants

- **Immutable Audit Trail**: Coupons that have already been applied to one or more completed orders cannot be hard-deleted. Calling `DELETE /:id` will automatically deactivate the coupon (`status = "INACTIVE"`), safeguarding all historical invoice numbers, order ledger entries, and accounting records.
- **Normalization**: All coupon codes are automatically trimmed and uppercase-normalized (e.g., ` summer2026 ` → `SUMMER2026`) upon creation, update, and customer validation.
- **Atomic Concurrency Control**: During checkout, coupon application and usage recording occur within the same ACID database transaction that creates the order.

---

## Admin Permissions & Security Matrix

All administrative promotion endpoints require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the specific granular permission constants:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.COUPON_READ` (`coupon:read`) | Read-Only | List coupons, view analytics metrics, inspect coupon details & usage audit history |
| `PERMISSIONS.COUPON_CREATE` (`coupon:create`) | Mutation | Create new coupon campaigns with discount rules and limits |
| `PERMISSIONS.COUPON_UPDATE` (`coupon:update`) | Mutation | Modify coupon parameters, update expiration dates, toggle active/inactive status |
| `PERMISSIONS.COUPON_DELETE` (`coupon:delete`) | Destructive / Archive | Hard-delete unused coupons or safely deactivate used coupons |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted execution across all promotion management endpoints |

---

## Discount Types & Calculation Rules

| Type | Field `type` | Calculation Formula | Example (`value: 20`, `subtotal: $100`) |
|---|---|---|---|
| **Percentage** | `PERCENTAGE` | `min(subtotal * (value / 100), maximumDiscountAmount ?? ∞)` | `20% of $100 = $20.00` (capped at max if set) |
| **Fixed Amount**| `FIXED_AMOUNT` | `min(value, subtotal)` | `$20.00 off` (cannot exceed total subtotal) |
| **Free Shipping** | `FREE_SHIPPING`| Discount = `$0.00`, sets `isFreeShipping: true` | Shipping charge waived at checkout |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/coupons` | `coupon:read` | List coupons with search, status, type filters, and pagination |
| `GET` | `/api/v1/coupons/metrics` | `coupon:read` | Promotion performance KPIs, redemption count, total discount dollars |
| `GET` | `/api/v1/coupons/:id` | `coupon:read` | Inspect coupon rules and 5 most recent redemptions |
| `POST` | `/api/v1/coupons` | `coupon:create` | Create a new promotional coupon code |
| `PUT` | `/api/v1/coupons/:id` | `coupon:update` | Update coupon rules, limits, or dates |
| `PATCH` | `/api/v1/coupons/:id/status`| `coupon:update` | Quick status switch (`ACTIVE`, `INACTIVE`, `EXPIRED`) |
| `DELETE`| `/api/v1/coupons/:id` | `coupon:delete` | Delete unused coupon or archive active coupon with usages |
| `GET` | `/api/v1/coupons/:id/usages`| `coupon:read` | Paginated audit log of all order redemptions for a coupon |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. List All Promotional Coupons (`GET /`)

Lists promotional coupons with search by code, status filter, discount type filter, and pagination.

- **Method**: `GET`
- **URL**: `/api/v1/coupons`
- **Permission**: `coupon:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `search` | `string` | No | - | Case-insensitive code search (e.g. `SUMMER`) |
| `type` | `enum` | No | - | `PERCENTAGE`, `FIXED_AMOUNT`, `FREE_SHIPPING` |
| `status` | `enum` | No | - | `ACTIVE`, `INACTIVE`, `EXPIRED` |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max results per page (Max: 100) |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "c7a8b9c0-1111-2222-3333-444455556666",
        "code": "SUMMER20",
        "type": "PERCENTAGE",
        "value": 20,
        "minimumOrderAmount": 50.00,
        "maximumDiscountAmount": 100.00,
        "usageLimit": 1000,
        "usageLimitPerUser": 1,
        "startsAt": "2026-06-01T00:00:00.000Z",
        "expiresAt": "2026-09-30T23:59:59.000Z",
        "status": "ACTIVE",
        "_count": {
          "usages": 142
        },
        "createdAt": "2026-05-20T10:00:00.000Z",
        "updatedAt": "2026-05-20T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

##### Scenario 1.B: Error - Unauthorized (`401 Unauthorized`)
```json
{
  "status": "error",
  "message": "Authentication required",
  "statusCode": 401
}
```

---

### 2. Get Promotion Analytics & Performance Metrics (`GET /metrics`)

Calculates macro marketing KPIs across all coupons, including active/inactive distribution, total financial discount dollars given, average discount per order, and top 5 most redeemed campaigns.

- **Method**: `GET`
- **URL**: `/api/v1/coupons/metrics`
- **Permission**: `coupon:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalCoupons": 15,
      "activeCoupons": 8,
      "inactiveCoupons": 4,
      "expiredCoupons": 3,
      "totalRedemptions": 1420,
      "totalDiscountGiven": 28450.75,
      "averageDiscountPerOrder": 20.04
    },
    "topCoupons": [
      {
        "id": "c7a8b9c0-1111-2222-3333-444455556666",
        "code": "SUMMER20",
        "type": "PERCENTAGE",
        "value": 20,
        "status": "ACTIVE",
        "redemptionCount": 650
      },
      {
        "id": "d8a9b0c1-2222-3333-4444-555566667777",
        "code": "FREESHIP",
        "type": "FREE_SHIPPING",
        "value": 0,
        "status": "ACTIVE",
        "redemptionCount": 420
      }
    ],
    "generatedAt": "2026-09-08T13:45:00.000Z"
  }
}
```

---

### 3. Get Coupon Details with Recent Usages (`GET /:id`)

Retrieves full configuration rules, global redemption count, and the 5 most recent order redemptions.

- **Method**: `GET`
- **URL**: `/api/v1/coupons/:id`
- **Permission**: `coupon:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "id": "c7a8b9c0-1111-2222-3333-444455556666",
    "code": "SUMMER20",
    "type": "PERCENTAGE",
    "value": 20,
    "minimumOrderAmount": 50.00,
    "maximumDiscountAmount": 100.00,
    "usageLimit": 1000,
    "usageLimitPerUser": 1,
    "startsAt": "2026-06-01T00:00:00.000Z",
    "expiresAt": "2026-09-30T23:59:59.000Z",
    "status": "ACTIVE",
    "_count": { "usages": 142 },
    "usages": [
      {
        "id": "usg-111",
        "orderId": "ord-222",
        "discountAmount": 24.50,
        "createdAt": "2026-09-08T12:00:00.000Z",
        "order": {
          "id": "ord-222",
          "orderNumber": "ORD-20260908-1001",
          "grandTotal": 98.00,
          "createdAt": "2026-09-08T12:00:00.000Z"
        }
      }
    ]
  }
}
```

##### Scenario 3.B: Error - Not Found (`404 Not Found`)
```json
{
  "status": "error",
  "message": "Coupon not found",
  "statusCode": 404
}
```

---

### 4. Create Promotional Coupon (`POST /`)

Creates a new coupon code with discount logic, constraints, and validity windows.

- **Method**: `POST`
- **URL**: `/api/v1/coupons`
- **Permission**: `coupon:create` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `code` | `string` | Yes | 3–50 chars, auto-uppercased | Unique promotion code |
| `type` | `enum` | Yes | `PERCENTAGE`, `FIXED_AMOUNT`, `FREE_SHIPPING` | Discount type |
| `value` | `number` | Yes | Min: 0 (1–100 if `PERCENTAGE`) | Discount value ($ or %) |
| `minimumOrderAmount` | `number` | No | Min: 0, nullable | Minimum order subtotal required |
| `maximumDiscountAmount` | `number` | No | Min: 0, nullable | Maximum cap on percentage discount |
| `usageLimit` | `integer` | No | Min: 1, nullable | Global maximum redemptions across platform |
| `usageLimitPerUser` | `integer` | No | Min: 1, nullable | Maximum redemptions per individual user |
| `startsAt` | `ISO 8601` | No | Nullable | Campaign activation date |
| `expiresAt` | `ISO 8601` | No | Must be > `startsAt` | Campaign expiration date |
| `status` | `enum` | No | Default: `ACTIVE` | `ACTIVE`, `INACTIVE`, `EXPIRED` |

#### Request Body Example
```json
{
  "code": "WELCOME10",
  "type": "FIXED_AMOUNT",
  "value": 10.00,
  "minimumOrderAmount": 30.00,
  "usageLimitPerUser": 1,
  "status": "ACTIVE"
}
```

#### Scenarios

##### Scenario 4.A: Success (`201 Created`)
```json
{
  "status": "success",
  "message": "Coupon \"WELCOME10\" created successfully",
  "data": {
    "id": "f1e2d3c4-5555-6666-7777-888899990000",
    "code": "WELCOME10",
    "type": "FIXED_AMOUNT",
    "value": 10.00,
    "minimumOrderAmount": 30.00,
    "maximumDiscountAmount": null,
    "usageLimit": null,
    "usageLimitPerUser": 1,
    "startsAt": null,
    "expiresAt": null,
    "status": "ACTIVE",
    "createdAt": "2026-09-08T13:50:00.000Z",
    "updatedAt": "2026-09-08T13:50:00.000Z"
  }
}
```

##### Scenario 4.B: Error - Duplicate Code Conflict (`409 Conflict`)
```json
{
  "status": "error",
  "message": "Coupon with code \"WELCOME10\" already exists",
  "statusCode": 409
}
```

##### Scenario 4.C: Error - Invalid Percentage Value (`400 Bad Request`)
- **Request**: `{"code": "BIGSALE", "type": "PERCENTAGE", "value": 150}`
```json
{
  "status": "error",
  "message": "Percentage coupon value must be between 1 and 100",
  "statusCode": 400
}
```

---

### 5. Update Existing Coupon (`PUT /:id`)

Updates rules, limits, or dates for an existing coupon.

- **Method**: `PUT`
- **URL**: `/api/v1/coupons/:id`
- **Permission**: `coupon:update` or `SUPER_ADMIN`

#### Request Body Example
```json
{
  "value": 15.00,
  "minimumOrderAmount": 40.00,
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Coupon \"WELCOME10\" updated successfully",
  "data": {
    "id": "f1e2d3c4-5555-6666-7777-888899990000",
    "code": "WELCOME10",
    "type": "FIXED_AMOUNT",
    "value": 15.00,
    "minimumOrderAmount": 40.00,
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "status": "ACTIVE"
  }
}
```

---

### 6. Toggle Coupon Status (`PATCH /:id/status`)

Quick status toggle to instantly activate or pause promotions.

- **Method**: `PATCH`
- **URL**: `/api/v1/coupons/:id/status`
- **Permission**: `coupon:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "status": "INACTIVE"
}
```

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Coupon status changed to INACTIVE",
  "data": {
    "id": "f1e2d3c4-5555-6666-7777-888899990000",
    "status": "INACTIVE"
  }
}
```

---

### 7. Delete or Archive Coupon (`DELETE /:id`)

Permanently deletes unused coupons, or automatically soft-archives coupons with existing order redemptions to preserve financial audit history.

- **Method**: `DELETE`
- **URL**: `/api/v1/coupons/:id`
- **Permission**: `coupon:delete` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 7.A: Success - Hard Deletion (No Prior Usages) (`200 OK`)
```json
{
  "status": "success",
  "message": "Coupon deleted successfully",
  "data": {
    "deleted": true,
    "archived": false,
    "id": "f1e2d3c4-5555-6666-7777-888899990000"
  }
}
```

##### Scenario 7.B: Success - Soft Archival (Coupon Has Order Usages) (`200 OK`)
```json
{
  "status": "success",
  "message": "Coupon has associated order usages; deactivated instead of deleted",
  "data": {
    "deleted": false,
    "archived": true,
    "id": "c7a8b9c0-1111-2222-3333-444455556666"
  }
}
```

---

### 8. List Coupon Redemption Audit Log (`GET /:id/usages`)

Lists paginated order redemption records for a specific coupon.

- **Method**: `GET`
- **URL**: `/api/v1/coupons/:id/usages?page=1&limit=20`
- **Permission**: `coupon:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 8.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "usg-1111",
        "couponId": "c7a8b9c0-1111-2222-3333-444455556666",
        "orderId": "ord-2222",
        "userId": "usr-3333",
        "discountAmount": 20.00,
        "createdAt": "2026-09-08T12:30:00.000Z",
        "coupon": {
          "id": "c7a8b9c0-1111-2222-3333-444455556666",
          "code": "SUMMER20",
          "type": "PERCENTAGE",
          "value": 20
        },
        "order": {
          "id": "ord-2222",
          "orderNumber": "ORD-20260908-1002",
          "status": "CONFIRMED",
          "grandTotal": 80.00
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## Audit Safety & Financial Integrity Rules

1. **No Destructive Deletes on Used Coupons**: If `usages.length > 0`, the system automatically changes `status = "INACTIVE"` instead of executing a SQL `DELETE`, preventing foreign key constraint violations and preserving accounting ledger integrity.
2. **Double-Redemption Prevention**: Per-user limits (`usageLimitPerUser`) are checked against existing `CouponUsage` records inside the order placement transaction.
3. **Subtotal Safeguards**: Fixed discount amounts cannot exceed order subtotal (discount is capped at `subtotal`, preventing negative subtotal or negative invoices).

---

## Error Codes & Diagnostics Reference

| HTTP Status | Error Type | Cause / Solution |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Percentage value not in 1–100 range, or `expiresAt` is before `startsAt` |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing or invalid bearer token |
| `403 Forbidden` | `FORBIDDEN` | Lacks `coupon:read`, `coupon:create`, `coupon:update`, or `coupon:delete` permission |
| `404 Not Found` | `NOT_FOUND` | Coupon UUID does not exist |
| `409 Conflict` | `DUPLICATE_CODE` | A coupon with the same uppercase code already exists |
