# User & Customer Management API Documentation

> **Base Route**: `/api/v1/user`  
> **Route File**: [`src/modules/user/user.route.ts`](file:///e:/e-com/server/src/modules/user/user.route.ts)  
> **Controller**: [`src/modules/user/controller/user.controller.ts`](file:///e:/e-com/server/src/modules/user/controller/user.controller.ts)  
> **Service**: [`src/modules/user/services/user.service.ts`](file:///e:/e-com/server/src/modules/user/services/user.service.ts)  
> **Validations**: [`src/modules/user/user.validation.ts`](file:///e:/e-com/server/src/modules/user/user.validation.ts)

---

## Table of Contents

1. [Architecture & Security Overview](#architecture--security-overview)
2. [Customer Tier & Risk Score Engine](#customer-tier--risk-score-engine)
3. [Authentication & Authorization](#authentication--authorization)
4. [Endpoints Summary](#endpoints-summary)
5. [Admin Customer Intelligence & Management Endpoints](#admin-customer-intelligence--management-endpoints)
   - [1. List All Customers with Ecommerce Intelligence (`GET /admin`)](#1-list-all-customers-with-ecommerce-intelligence-get-admin)
   - [2. Customer Analytics & Platform Metrics (`GET /admin/metrics`)](#2-customer-analytics--platform-metrics-get-adminmetrics)
   - [3. Customer 360-Degree Intelligence View (`GET /admin/:userId/360`)](#3-customer-360-degree-intelligence-view-get-adminuserid360)
   - [4. Update Customer Status - Block/Suspend/Activate (`PATCH /admin/:userId/status`)](#4-update-customer-status---blocksuspendactivate-patch-adminuseridstatus)
   - [5. Update User Profile & Status Details (`PATCH /admin/:userId`)](#5-update-user-profile--status-details-patch-adminuserid)
6. [Customer Self-Service Endpoints](#customer-self-service-endpoints)
   - [6. Update Own Profile (`PATCH /profile`)](#6-update-own-profile-patch-profile)
   - [7. Add Delivery/Billing Address (`POST /addresses`)](#7-add-deliverybilling-address-post-addresses)
   - [8. Update Saved Address (`PATCH /addresses/:addressId`)](#8-update-saved-address-patch-addressesaddressid)
   - [9. Delete Saved Address (`DELETE /addresses/:addressId`)](#9-delete-saved-address-delete-addressesaddressid)
   - [10. Request Phone Verification OTP (`POST /phone/request-otp`)](#10-request-phone-verification-otp-post-phonerequest-otp)
   - [11. Verify Phone Number with OTP (`PUT /phone`)](#11-verify-phone-number-with-otp-put-phone)
7. [Standard Response & Error Formats](#standard-response--error-formats)

---

## Architecture & Security Overview

The User Module provides dual capabilities:
1. **Admin Customer Intelligence**: Real-time customer tracking table, VIP tiers, computed lifetime spend, risk scoring, account blocking, and 360-degree customer relationship profiles.
2. **Customer Self-Service**: Profile updates, saved address management (with IDOR protection and XSS mitigation), and phone verification via 4-digit Redis-backed SMS OTPs (5-minute TTL).

All routes enforce authentication via `app.addHook("preHandler", app.authenticate)` and granular RBAC permissions (`user:read`, `user:update`).

---

## Customer Tier & Risk Score Engine

### 1. Customer Loyalty Tiers
Tiers are dynamically evaluated based on total non-cancelled lifetime spend:

| Tier | Spend Range | Benefits / Status |
|---|---|---|
| `BRONZE` | $0.00 – $199.99 | Entry level customer |
| `SILVER` | $200.00 – $999.99 | Repeat customer |
| `GOLD` | $1,000.00 – $4,999.99 | VIP customer |
| `PLATINUM` | $5,000.00+ | Elite high-value customer |

### 2. Risk Score & Fraud Indicators (0–100)
Risk scores assist back-office and admin teams in identifying suspicious accounts or fraud risks:
- Unverified Email: `+15` points
- Unverified Phone: `+15` points
- High Order Cancellation Ratio (`>= 40%`): `+25` points
- `PENDING_VERIFICATION` Status: `+20` points
- `SUSPENDED` Status: `+35` points
- `BLOCKED` Status: `+50` points

| Risk Level | Score Range | Action Indicator |
|---|---|---|
| `LOW` | `0 – 34` | Safe account |
| `MEDIUM` | `35 – 69` | `riskFlag: true` (Monitor orders) |
| `HIGH` | `70 – 100` | `riskFlag: true`, `actionNeeded: true` (Review / Verify ID) |

---

## Authentication & Authorization

| Header | Required For | Description |
|---|---|---|
| `Authorization: Bearer <accessToken>` | All Routes | JWT Access Token |

| Permission | Endpoints Authorized |
|---|---|
| `user:read` | List all customers, customer metrics dashboard, customer 360-degree view |
| `user:update` | Block/Suspend/Activate users, modify user account details, revoke sessions |
| Authenticated User | Update own profile, manage own address book, request & verify phone OTP |

---

## Endpoints Summary

| Method | Endpoint | Access Level | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/user/admin` | Admin | `user:read` | List all customers with tier, spend, orders, risk & action flags |
| `GET` | `/api/v1/user/admin/metrics` | Admin | `user:read` | Global metrics: Total customers, repeat purchase rate, LTV, tiers |
| `GET` | `/api/v1/user/admin/:userId/360` | Admin | `user:read` | Complete 360 intelligence: Orders, addresses, reviews, cart, sessions |
| `PATCH` | `/api/v1/user/admin/:userId/status` | Admin | `user:update` | Update status (`ACTIVE`, `SUSPENDED`, `BLOCKED`) & revoke sessions |
| `PATCH` | `/api/v1/user/admin/:userId` | Admin | `user:update` | Modify user profile names or status |
| `PATCH` | `/api/v1/user/profile` | Customer | None (Own) | Update authenticated user's first and last name |
| `POST` | `/api/v1/user/addresses` | Customer | None (Own) | Add delivery/billing address to address book |
| `PATCH` | `/api/v1/user/addresses/:addressId` | Customer | None (Own) | Update saved address with ownership verification |
| `DELETE` | `/api/v1/user/addresses/:addressId` | Customer | None (Own) | Delete saved address with ownership verification |
| `POST` | `/api/v1/user/phone/request-otp` | Customer | None (Own) | Request 4-digit SMS verification OTP (5m TTL) |
| `PUT` | `/api/v1/user/phone` | Customer | None (Own) | Verify phone number with 4-digit OTP |

---

## Admin Customer Intelligence & Management Endpoints

---

### 1. List All Customers with Ecommerce Intelligence (`GET /admin`)

Retrieves a paginated, filterable table of customer accounts enriched with order counts, lifetime spend, loyalty tier, risk score, risk level, action flags, and last order dates.

- **Method**: `GET`
- **URL**: `/api/v1/user/admin`
- **Permission**: `user:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page (1–100) |
| `search` | `string` | No | - | Multi-field search (email, name, phone) |
| `status` | `enum` | No | - | `ACTIVE`, `SUSPENDED`, `BLOCKED`, `PENDING_VERIFICATION` |
| `tier` | `enum` | No | - | `ALL`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM` |
| `riskFlagOnly` | `boolean` | No | `false` | When `true`, filters only flagged/suspicious accounts |
| `sortBy` | `enum` | No | `createdAt` | `createdAt`, `totalSpend`, `totalOrders`, `lastLoginAt`, `riskScore` |
| `sortOrder` | `enum` | No | `desc` | `asc` or `desc` |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Admin users fetched successfully",
  "data": {
    "items": [
      {
        "id": "u1111111-2222-3333-4444-555555555555",
        "email": "sarah.connor@example.com",
        "firstName": "Sarah",
        "lastName": "Connor",
        "phone": "+15550199283",
        "avatarUrl": "https://ik.imagekit.io/avatars/sarah.jpg",
        "status": "ACTIVE",
        "emailVerified": true,
        "phoneVerified": true,
        "lastLoginAt": "2026-09-08T17:00:00.000Z",
        "createdAt": "2026-08-01T10:00:00.000Z",
        "roles": ["CUSTOMER"],
        "totalOrders": 14,
        "totalSpend": 2840.50,
        "tier": "GOLD",
        "riskScore": 0,
        "riskLevel": "LOW",
        "riskFlag": false,
        "actionNeeded": false,
        "lastOrderDate": "2026-09-07T14:30:00.000Z"
      },
      {
        "id": "u2222222-3333-4444-5555-666666666666",
        "email": "suspicious.actor@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "phone": null,
        "avatarUrl": null,
        "status": "SUSPENDED",
        "emailVerified": false,
        "phoneVerified": false,
        "lastLoginAt": "2026-09-05T08:00:00.000Z",
        "createdAt": "2026-09-04T12:00:00.000Z",
        "roles": ["CUSTOMER"],
        "totalOrders": 3,
        "totalSpend": 0.00,
        "tier": "BRONZE",
        "riskScore": 90,
        "riskLevel": "HIGH",
        "riskFlag": true,
        "actionNeeded": true,
        "lastOrderDate": "2026-09-05T08:10:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

##### Scenario 1.B: Error - Missing Permission (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Forbidden: Required permission 'user:read' missing",
  "statusCode": 403
}
```

---

### 2. Customer Analytics & Platform Metrics (`GET /admin/metrics`)

Aggregates high-level customer KPIs including total accounts, active customers, repeat purchase rate, average lifetime value (LTV), risk flagged accounts, and tier distributions.

- **Method**: `GET`
- **URL**: `/api/v1/user/admin/metrics`
- **Permission**: `user:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "User metrics retrieved successfully",
  "data": {
    "totalCustomers": 1540,
    "activeCustomers": 1495,
    "newCustomersThisMonth": 128,
    "repeatPurchaseRate": 43.8,
    "averageLifetimeValue": 312.45,
    "riskFlaggedAccounts": 14,
    "statusDistribution": {
      "ACTIVE": 1495,
      "SUSPENDED": 22,
      "BLOCKED": 8,
      "PENDING_VERIFICATION": 15
    },
    "tierDistribution": {
      "BRONZE": 920,
      "SILVER": 410,
      "GOLD": 165,
      "PLATINUM": 45
    }
  }
}
```

---

### 3. Customer 360-Degree Intelligence View (`GET /admin/:userId/360`)

Provides complete customer 360-degree intelligence including profile, spending summary, average order value (AOV), recent orders with line items, saved addresses, reviews submitted, active shopping carts, wishlists, and active login sessions.

- **Method**: `GET`
- **URL**: `/api/v1/user/admin/:userId/360`
- **Permission**: `user:read` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `userId` | `UUID` | Yes | Target customer user ID |

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Customer 360 intelligence retrieved successfully",
  "data": {
    "profile": {
      "id": "u1111111-2222-3333-4444-555555555555",
      "email": "sarah.connor@example.com",
      "firstName": "Sarah",
      "lastName": "Connor",
      "phone": "+15550199283",
      "avatarUrl": "https://ik.imagekit.io/avatars/sarah.jpg",
      "status": "ACTIVE",
      "emailVerified": true,
      "phoneVerified": true,
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-09-08T12:00:00.000Z",
      "lastLoginAt": "2026-09-08T17:00:00.000Z",
      "roles": ["CUSTOMER"]
    },
    "summary": {
      "tier": "GOLD",
      "totalSpend": 2840.50,
      "totalOrders": 14,
      "completedOrders": 13,
      "cancelledOrders": 1,
      "averageOrderValue": 218.50,
      "riskScore": 0,
      "riskLevel": "LOW",
      "riskFlag": false,
      "actionNeeded": false
    },
    "engagement": {
      "totalReviews": 4,
      "averageRatingGiven": 4.8,
      "activeCartItemsCount": 2,
      "wishlistItemsCount": 5
    },
    "addresses": [
      {
        "id": "addr-11111111-2222-3333-4444-555555555555",
        "recipientName": "Sarah Connor",
        "addressLine1": "742 Evergreen Terrace",
        "addressLine2": null,
        "city": "Springfield",
        "state": "Oregon",
        "postalCode": "97477",
        "country": "United States",
        "createdAt": "2026-08-01T10:05:00.000Z"
      }
    ],
    "recentOrders": [
      {
        "id": "ord-11111111-2222-3333-4444-555555555555",
        "orderNumber": "ORD-20260907-8A31F",
        "status": "DELIVERED",
        "grandTotal": 189.99,
        "itemCount": 2,
        "items": [
          {
            "id": "item-1",
            "productName": "Leather Weekend Bag",
            "quantity": 1,
            "unitPrice": 189.99,
            "totalPrice": 189.99
          }
        ],
        "createdAt": "2026-09-07T14:30:00.000Z"
      }
    ],
    "recentReviews": [
      {
        "id": "rev-1",
        "product": {
          "id": "prod-1",
          "name": "Leather Weekend Bag",
          "slug": "leather-weekend-bag"
        },
        "rating": 5,
        "title": "Outstanding craftsmanship",
        "comment": "Exceeded all expectations, great leather quality.",
        "status": "APPROVED",
        "createdAt": "2026-09-08T09:00:00.000Z"
      }
    ],
    "activeSessions": [
      {
        "id": "sess-1",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "createdAt": "2026-09-08T17:00:00.000Z",
        "lastActiveAt": "2026-09-08T17:25:00.000Z",
        "expiresAt": "2026-09-15T17:00:00.000Z"
      }
    ]
  }
}
```

##### Scenario 3.B: Error - Customer Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Customer not found",
  "statusCode": 404
}
```

---

### 4. Update Customer Status - Block/Suspend/Activate (`PATCH /admin/:userId/status`)

Updates the account status of any customer. If an account is `SUSPENDED` or `BLOCKED`, the system automatically revokes all active login sessions and invalidates Redis auth tokens immediately.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/admin/:userId/status`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Values | Description |
|---|---|---|---|---|
| `status` | `enum` | Yes | `ACTIVE`, `SUSPENDED`, `BLOCKED`, `PENDING_VERIFICATION` | New account status |
| `reason` | `string` | No | Max 500 chars | Reason for status transition |

#### Request Body Example
```json
{
  "status": "BLOCKED",
  "reason": "Confirmed fraudulent payment chargebacks"
}
```

#### Scenarios

##### Scenario 4.A: Success - Account Blocked & Sessions Revoked (`200 OK`)
```json
{
  "success": true,
  "message": "User status updated to BLOCKED successfully",
  "data": {
    "id": "u2222222-3333-4444-5555-666666666666",
    "email": "suspicious.actor@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "status": "BLOCKED",
    "updatedAt": "2026-09-08T18:20:00.000Z"
  }
}
```

---

### 5. Update User Profile & Status Details (`PATCH /admin/:userId`)

Modifies a user's names or account status.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/admin/:userId`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### Request Body Example
```json
{
  "firstName": "Sarah",
  "lastName": "Connor-Reese",
  "status": "ACTIVE"
}
```

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": "u1111111-2222-3333-4444-555555555555",
    "email": "sarah.connor@example.com",
    "firstName": "Sarah",
    "lastName": "Connor-Reese",
    "status": "ACTIVE"
  }
}
```

---

## Customer Self-Service Endpoints

---

### 6. Update Own Profile (`PATCH /profile`)

Updates first and last name for the authenticated customer.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/profile`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "firstName": "Alex",
  "lastName": "Morgan"
}
```

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "firstName": "Alex",
    "lastName": "Morgan"
  }
}
```

---

### 7. Add Delivery/Billing Address (`POST /addresses`)

Adds a new address to the user's address book with XSS sanitization and strict schema validation.

- **Method**: `POST`
- **URL**: `/api/v1/user/addresses`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "recipientName": "Alex Morgan",
  "addressLine1": "742 Evergreen Terrace",
  "addressLine2": "Apt 4B",
  "city": "Springfield",
  "state": "Oregon",
  "postalCode": "97477",
  "country": "United States"
}
```

#### Scenarios

##### Scenario 7.A: Success (`201 Created`)
```json
{
  "success": true,
  "message": "Address created successfully",
  "data": {
    "id": "addr-11111111-2222-3333-4444-555555555555",
    "recipientName": "Alex Morgan",
    "addressLine1": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "Oregon",
    "postalCode": "97477",
    "country": "United States"
  }
}
```

---

### 8. Update Saved Address (`PATCH /addresses/:addressId`)

Updates an address owned by the authenticated customer.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/addresses/:addressId`
- **Access**: Authenticated Customer

#### Scenarios

##### Scenario 8.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Address updated successfully",
  "data": {
    "id": "addr-11111111-2222-3333-4444-555555555555",
    "recipientName": "Alex Morgan",
    "addressLine1": "100 Broadway St",
    "city": "New York",
    "state": "New York",
    "postalCode": "10001",
    "country": "United States"
  }
}
```

##### Scenario 8.B: Error - Unauthorized Update on Another User's Address (`403 Forbidden` / `404 Not Found`)
```json
{
  "success": false,
  "message": "Failed to process Address request",
  "statusCode": 403
}
```

---

### 9. Delete Saved Address (`DELETE /addresses/:addressId`)

Deletes an address belonging to the authenticated customer.

- **Method**: `DELETE`
- **URL**: `/api/v1/user/addresses/:addressId`
- **Access**: Authenticated Customer

#### Scenarios

##### Scenario 9.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

---

### 10. Request Phone Verification OTP (`POST /phone/request-otp`)

Generates a 4-digit verification code stored in Redis under `phone_otp:<userId>` with a 5-minute TTL.

- **Method**: `POST`
- **URL**: `/api/v1/user/phone/request-otp`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "phone": "+15550199283"
}
```

#### Scenarios

##### Scenario 10.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Phone verification OTP generated",
  "data": {
    "tempOtp": "4829"
  }
}
```

##### Scenario 10.B: Error - Duplicate Phone Number (`409 Conflict`)
```json
{
  "success": false,
  "message": "Phone number is already in use",
  "statusCode": 409
}
```

---

### 11. Verify Phone Number with OTP (`PUT /phone`)

Verifies the 4-digit OTP and marks `phoneVerified: true`.

- **Method**: `PUT`
- **URL**: `/api/v1/user/phone`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "phone": "+15550199283",
  "otp": "4829"
}
```

#### Scenarios

##### Scenario 11.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Phone number verified successfully",
  "data": {
    "phone": "+15550199283",
    "phoneVerified": true
  }
}
```

##### Scenario 11.B: Error - Invalid or Expired OTP (`400 Bad Request`)
```json
{
  "success": false,
  "message": "OTP is invalid or expired",
  "statusCode": 400
}
```

---

## Standard Response & Error Formats

### Success Response (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": {}
}
```

### Error Response
```json
{
  "success": false,
  "message": "Descriptive error message",
  "statusCode": 400
}
```

| HTTP Status | Reason | Scenario |
|---|---|---|
| `200 OK` | Success | User queries, profile update, address update/delete, OTP verification |
| `201 Created` | Created | Address created |
| `400 Bad Request` | Validation Error | Invalid phone format, wrong OTP, invalid address characters |
| `401 Unauthorized` | Auth Required | Missing or expired JWT token |
| `403 Forbidden` | Access Denied | Missing `user:read` or `user:update` permission |
| `404 Not Found` | Not Found | User ID or address ID does not exist |
| `409 Conflict` | Conflict | Phone number already taken by another account |
