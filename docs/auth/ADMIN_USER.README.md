# Customer Management & 360 Intelligence - Admin API Documentation

> **Base Route**: `/api/v1/user`  
> **Route File**: [`src/modules/user/user.route.ts`](file:///e:/e-com/server/src/modules/user/user.route.ts)  
> **Controller**: [`src/modules/user/controller/user.controller.ts`](file:///e:/e-com/server/src/modules/user/controller/user.controller.ts)  
> **Admin Service**: [`src/modules/user/services/userAdmin.service.ts`](file:///e:/e-com/server/src/modules/user/services/userAdmin.service.ts)  
> **Validations**: [`src/modules/user/user.validation.ts`](file:///e:/e-com/server/src/modules/user/user.validation.ts)  
> **Target Audience**: Admin Dashboard, Customer Support Portals, Fraud Detection Teams & Operations Staff

---

## Table of Contents

1. [Admin Capabilities Overview](#admin-capabilities-overview)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Customer Loyalty Tier & Risk Score Engine](#customer-loyalty-tier--risk-score-engine)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List All Customers with Ecommerce Intelligence (`GET /admin`)](#1-list-all-customers-with-ecommerce-intelligence-get-admin)
   - [2. Customer Analytics & Platform KPIs (`GET /admin/metrics`)](#2-customer-analytics--platform-kpis-get-adminmetrics)
   - [3. Customer 360-Degree Intelligence View (`GET /admin/:userId/360`)](#3-customer-360-degree-intelligence-view-get-adminuserid360)
   - [4. Moderate Customer Status - Block/Suspend/Activate (`PATCH /admin/:userId/status`)](#4-moderate-customer-status---blocksuspendactivate-patch-adminuseridstatus)
   - [5. Update User Profile & Account (`PATCH /admin/:userId`)](#5-update-user-profile--account-patch-adminuserid)
6. [Cross-Module Admin Session Management](#cross-module-admin-session-management)
7. [Security & Error Codes Reference](#security--error-codes-reference)

---

## Admin Capabilities Overview

```
                      ┌─────────────────────────────────────────┐
                      │    ADMIN CUSTOMER INTELLIGENCE HUB      │
                      └────────────────────┬────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│  CUSTOMER TABLE  │             │   CUSTOMER 360   │             │   ANALYTICS &    │
│   & TRACKING     │             │   INTELLIGENCE   │             │    MODERATION    │
├──────────────────┤             ├──────────────────┤             ├──────────────────┤
│• Multi-field Srch│             │• Order History   │             │• Repeat Rate (%) │
│• Lifetime Spend  │             │• AOV Calculation │             │• Avg LTV ($)     │
│• Loyalty Tiers   │             │• Saved Addresses │             │• Tier Breakdown  │
│• Risk Score (0-1)│             │• Review History  │             │• Block / Suspend │
│• Action Needed   │             │• Active Cart/Wish│             │• Session Revoke  │
│• Sort by Revenue │             │• Live Sessions   │             │• Token Clearing  │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

---

## Admin Permissions & Security Matrix

All admin routes require an `Authorization: Bearer <token>` header belonging to a user with `SUPER_ADMIN` role **OR** the specific permission constants:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.USER_READ` (`user:read`) | Read Only | View customer table with spend/tier, analytics metrics dashboard, 360-degree customer intelligence |
| `PERMISSIONS.USER_UPDATE` (`user:update`) | Read & Write | Change account status (`ACTIVE`, `SUSPENDED`, `BLOCKED`, `PENDING_VERIFICATION`), edit profile names, revoke sessions |
| Role: `SUPER_ADMIN` | Full System Control | Unrestricted access across all customer and administrative endpoints |

---

## Customer Loyalty Tier & Risk Score Engine

### 1. Loyalty Tiers (Evaluated from Non-Cancelled Lifetime Spend)
- **`BRONZE`** ($0.00 – $199.99): Standard or new customer.
- **`SILVER`** ($200.00 – $999.99): Returning customer with validated repeat order history.
- **`GOLD`** ($1,000.00 – $4,999.99): VIP high-value buyer eligible for premium support and loyalty promotions.
- **`PLATINUM`** ($5,000.00+): Elite enterprise / high-volume account.

### 2. Fraud & Risk Score Engine (0–100)
Every customer receives a dynamic risk score computed across verification flags, account state, and historical cancellation patterns:

$$\text{RiskScore} = \min(100, \text{UnverifiedEmail (15)} + \text{UnverifiedPhone (15)} + \text{StatusPenalty} + \text{CancellationPenalty})$$

- **Unverified Email**: `+15` points
- **Unverified Phone**: `+15` points
- **High Cancellation Ratio** ($>40\%$ orders cancelled/refunded): `+25` points
- **`PENDING_VERIFICATION`**: `+20` points
- **`SUSPENDED`**: `+35` points
- **`BLOCKED`**: `+50` points

| Risk Level | Score Range | System Action |
|---|---|---|
| `LOW` | `0 – 34` | Regular shopping flow |
| `MEDIUM` | `35 – 69` | `riskFlag: true` (Flagged for payment monitoring) |
| `HIGH` | `70 – 100` | `riskFlag: true`, `actionNeeded: true` (Manual review required) |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/user/admin` | `user:read` | List all customers with Tier, Lifetime Spend, Order Count, and Risk Scores |
| `GET` | `/api/v1/user/admin/metrics` | `user:read` | Customer Analytics KPIs: Repeat purchase rate, LTV, and tier distributions |
| `GET` | `/api/v1/user/admin/:userId/360` | `user:read` | 360-Degree Intelligence: Orders, addresses, reviews, active cart, and sessions |
| `PATCH` | `/api/v1/user/admin/:userId/status` | `user:update` | Change status (`ACTIVE`, `SUSPENDED`, `BLOCKED`) and auto-revoke sessions |
| `PATCH` | `/api/v1/user/admin/:userId` | `user:update` | Modify customer profile names or status |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. List All Customers with Ecommerce Intelligence (`GET /admin`)

Retrieves a paginated list of all customer accounts with computed lifetime spend, order count, VIP loyalty tier, risk score, and `actionNeeded` flags.

- **Method**: `GET`
- **URL**: `/api/v1/user/admin`
- **Permission**: `user:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |
| `search` | `string` | No | - | Multi-field search (email, first name, last name, phone) |
| `status` | `enum` | No | - | Filter by status: `ACTIVE`, `SUSPENDED`, `BLOCKED`, `PENDING_VERIFICATION` |
| `tier` | `enum` | No | - | Filter by tier: `ALL`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM` |
| `riskFlagOnly` | `boolean` | No | `false` | When `true`, filters only high-risk / flagged accounts |
| `sortBy` | `enum` | No | `createdAt` | `createdAt`, `totalSpend`, `totalOrders`, `lastLoginAt`, `riskScore` |
| `sortOrder` | `enum` | No | `desc` | `asc` or `desc` |

#### Scenarios

##### Scenario 1.A: Success - Sorted by Total Spend (`200 OK`)
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

### 2. Customer Analytics & Platform KPIs (`GET /admin/metrics`)

Aggregates high-level customer KPIs including total customer count, active accounts, repeat purchase rate, average lifetime value (LTV), and distribution breakdowns.

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

Retrieves full 360-degree intelligence for a specific customer: Profile, Financial summary, Average Order Value (AOV), recent orders with line items, saved addresses, submitted reviews, active shopping carts, wishlists, and active login sessions.

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
        "lastUsedAt": "2026-09-08T17:25:00.000Z",
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

### 4. Moderate Customer Status - Block/Suspend/Activate (`PATCH /admin/:userId/status`)

Updates customer account status. If the account is transitioned to `SUSPENDED` or `BLOCKED`, all active user sessions are forcibly revoked in the database and the Redis authentication cache is invalidated immediately.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/admin/:userId/status`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `userId` | `UUID` | Yes | Target customer user ID |

#### Request Body
```json
{
  "status": "BLOCKED",
  "reason": "Confirmed fraudulent payment chargebacks"
}
```

#### Scenarios

##### Scenario 4.A: Success - Account Blocked (`200 OK`)
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

##### Scenario 4.B: Success - Account Reactivated (`200 OK`)
```json
{
  "success": true,
  "message": "User status updated to ACTIVE successfully",
  "data": {
    "id": "u2222222-3333-4444-5555-666666666666",
    "status": "ACTIVE",
    "updatedAt": "2026-09-08T18:30:00.000Z"
  }
}
```

---

### 5. Update User Profile & Account (`PATCH /admin/:userId`)

Modifies profile names or status of an existing user account.

- **Method**: `PATCH`
- **URL**: `/api/v1/user/admin/:userId`
- **Permission**: `user:update` or `SUPER_ADMIN`

#### Request Body
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

## Cross-Module Admin Session Management

Admin operators can inspect and terminate individual login sessions under [`authorization.route.ts`](file:///e:/e-com/server/src/modules/authorization/authorization.route.ts):

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/authorization/users/:userId/sessions` | `user:read` | List all active login devices and IP addresses for a user |
| `DELETE` | `/api/v1/authorization/users/:userId/sessions/:sessionId` | `user:update` | Forcibly revoke a single device session |

---

## Security & Error Codes Reference

| HTTP Status | Reason | Typical Cause |
|---|---|---|
| `200 OK` | Operation Successful | Data retrieval, status modification, profile update |
| `400 Bad Request` | Validation Failure | Invalid UUID, unallowed status value |
| `401 Unauthorized` | Missing / Invalid Token | Missing `Authorization: Bearer <token>` |
| `403 Forbidden` | Access Denied | User lacks `user:read` or `user:update` permission |
| `404 Not Found` | Entity Missing | Customer with given UUID does not exist |
