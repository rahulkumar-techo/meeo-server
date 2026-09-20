# MEEO Promotions Module API & Technical Documentation

> **Base Route**: `/api/v1/promotions`  
> **Route Definition**: [`src/modules/promotions/routes/promotion.route.ts`](file:///e:/e-com/server/src/modules/promotions/routes/promotion.route.ts)  
> **Controller**: [`src/modules/promotions/controller/promotion.controller.ts`](file:///e:/e-com/server/src/modules/promotions/controller/promotion.controller.ts)  
> **Core Engine**: [`src/modules/promotions/services/promotionEngine.service.ts`](file:///e:/e-com/server/src/modules/promotions/services/promotionEngine.service.ts)  
> **Prisma Models**: [`prisma/schema/promotion/promotion.prisma`](file:///e:/e-com/server/prisma/schema/promotion/promotion.prisma)  

---

## Table of Contents

1. [Architecture & System Flow](#architecture--system-flow)
2. [Promotion Types & Calculation Rules](#promotion-types--calculation-rules)
3. [Priority, Stacking & Conflict Resolution](#priority-stacking--conflict-resolution)
4. [Public & Customer Endpoints](#public--customer-endpoints)
   - [Preview Cart Promotions (`POST /preview`)](#1-preview-cart-promotions-post-preview)
   - [Validate Promo Code (`POST /validate-code`)](#2-validate-promo-code-post-validate-code)
   - [Active Public Banners (`GET /active`)](#3-active-public-banners-get-active)
   - [My Redemption History (`GET /my-history`)](#4-my-redemption-history-get-my-history)
5. [Administrative Management Endpoints](#administrative-management-endpoints)
   - [List Promotions (`GET /`)](#5-list-promotions-get-)
   - [Get Promotion Details (`GET /:id`)](#6-get-promotion-details-get-id)
   - [Create Promotion (`POST /`)](#7-create-promotion-post-)
   - [Update Promotion (`PUT /:id`)](#8-update-promotion-put-id)
   - [Publish Promotion (`PATCH /:id/publish`)](#9-publish-promotion-patch-idpublish)
   - [Pause Promotion (`PATCH /:id/pause`)](#10-pause-promotion-patch-idpause)
   - [Archive Promotion (`PATCH /:id/archive`)](#11-archive-promotion-patch-idarchive)
   - [Toggle Status (`PATCH /:id/status`)](#12-toggle-status-patch-idstatus)
6. [Redis Caching & Invalidation](#redis-caching--invalidation)
7. [Transactional Checkout Integration](#transactional-checkout-integration)

---

## Architecture & System Flow

### Lifecycle State Machine

```
   ┌─────────┐       Publish (startsAt in future)       ┌─────────────┐
   │  DRAFT  ├─────────────────────────────────────────►│  SCHEDULED  │
   └────┬────┘                                          └──────┬──────┘
        │                                                      │
        │ Publish (now >= startsAt)                            │ StartsAt reached
        ▼                                                      ▼
   ┌─────────┐               Pause                      ┌─────────────┐
   │ ACTIVE  │◄─────────────────────────────────────────┤   PAUSED    │
   └────┬────┘               Resume                     └──────┬──────┘
        │                                                      │
        │ EndsAt reached                                       │ Archive
        ▼                                                      ▼
   ┌─────────┐                                          ┌─────────────┐
   │ EXPIRED │─────────────────────────────────────────►│  ARCHIVED   │
   └─────────┘               Archive                    └─────────────┘
```

### Promotion Evaluation & Checkout Flow

```
1. Customer initiates Cart Preview or Checkout (Cart Items + Optional Promo Code)
                      │
                      ▼
2. Resolve Active Candidates (Redis Cache -> Fallback PostgreSQL DB)
   ├─ Automatic Active Campaigns (sorted by priority DESC)
   └─ Single Entered Promo Code (if provided)
                      │
                      ▼
3. PromotionEngine Rule Pipeline
   ├─ Schedule Check (startsAt <= now <= endsAt)
   ├─ Flash Sale Time Window Check (timeOfDayStart <= now.time <= timeOfDayEnd)
   ├─ Days of Week Match (daysOfWeek.includes(now.day))
   ├─ Customer Segment & First-Order Check (e.g. VIP, FIRST_TIME_BUYER)
   ├─ Targeting Filters (Product, Category, Brand inclusions/exclusions)
   ├─ Cart Thresholds (minOrderSubtotal, minQuantity)
   └─ Global and Per-User Usage Limit Verification
                      │
                      ▼
4. Priority & Stacking Conflict Resolution
   ├─ High-to-Low Priority Ordering
   ├─ EXCLUSIVE rules prevent mixing with other campaigns
   ├─ Pro-rate line-item discount allocations
   └─ Capped at 100% of subtotal (never negative)
                      │
                      ▼
5. Order Checkout: Atomic $transaction
   ├─ Insert immutable Order & OrderItem records
   ├─ Atomically increment promotion.currentUsageCount
   ├─ Insert PromotionUsage and CouponUsage audit rows
   └─ Commit Inventory Reservations & Clear Shopping Cart
```

---

## Promotion Types & Calculation Rules

| Type | Target Scope | Calculation Formula |
| :--- | :--- | :--- |
| `PERCENTAGE` | Entire Cart / Target Items | `discount = min((subtotal * discountValue) / 100, maxDiscountAmount)` |
| `FIXED_DISCOUNT` | Entire Cart / Target Items | `discount = min(discountValue, subtotal)` |
| `BUY_X_GET_Y` | Qualifying Product Sets | `discount = floor(qty / (buyX + getY)) * getY * unitPrice * (pct / 100)` |
| `FREE_SHIPPING` | Order Shipping Line | `shippingDiscount = shippingFee`, `finalShippingFee = 0.00` |
| `PRODUCT_DISCOUNT` | Specific Product IDs | Percentage discount allocated to matched product items |
| `CATEGORY_DISCOUNT`| Specific Category IDs | Percentage discount allocated to items in matched categories |
| `BRAND_DISCOUNT` | Specific Brand IDs | Percentage discount allocated to items belonging to target brands |
| `FLASH_SALE` | Time & Day Constrained | Deep discount active only during configured daily time window |

---

## Priority, Stacking & Conflict Resolution

* **Priority Order**: Promoted campaigns are evaluated in descending order of `priority` (e.g. `priority: 100` before `priority: 10`).
* **Stacking Policies**:
  * `EXCLUSIVE`: If applied, no other promotions can be combined on the cart.
  * `STACKABLE_WITH_OTHERS`: Allows combining with other stackable promotions until subtotal reaches zero.
  * `STACKABLE_WITH_COUPONS`: Can combine with standard coupon codes.
* **Server-Side Safety**: Client-sent discount values are completely disregarded. The server evaluates fresh database records and locks usage atomically.

---

## Public & Customer Endpoints

### 1. Preview Cart Promotions (`POST /preview`)

* **Authentication**: Optional (Guest or Authenticated Customer)
* **Summary**: Calculates server-side discounts and item-level allocations for shopping cart items.

#### Request Payload
```json
{
  "promoCode": "SUMMER20",
  "shippingFee": 15.00,
  "items": [
    {
      "productId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "variantId": "2c9b3c4a-6d8e-4a8a-9f5b-1c3d5e7f9a1b",
      "categoryId": "4a8e6d2c-9b1d-4bad-9bdd-3d7b3dcb6d2a",
      "brandId": "8b2d6e4a-1c3d-4bad-9bdd-7b3dcb6d2a9b",
      "productName": "Nike Running Shoes",
      "unitPrice": 120.00,
      "quantity": 2
    },
    {
      "productId": "7d3b3dcb-6d2a-4bad-9bdd-9b1deb4d3b7d",
      "productName": "Nike Sports Socks",
      "unitPrice": 15.00,
      "quantity": 1
    }
  ]
}
```

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "originalSubtotal": 255.00,
    "discountSubtotal": 51.00,
    "shippingFee": 15.00,
    "shippingDiscount": 15.00,
    "finalShippingFee": 0.00,
    "isFreeShipping": true,
    "grandTotal": 204.00,
    "totalDiscount": 66.00,
    "appliedPromotions": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "name": "Summer 20% Off",
        "slug": "summer-20",
        "code": "SUMMER20",
        "type": "PERCENTAGE",
        "stackingRule": "STACKABLE_WITH_OTHERS",
        "isAutomatic": false,
        "discountAmount": 51.00,
        "isFreeShipping": false,
        "freeShippingDiscount": 0.00,
        "matchedItemCount": 2,
        "description": "20% off entire summer cart"
      },
      {
        "id": "22222222-3333-4444-5555-666666666666",
        "name": "Free Shipping on Orders over $150",
        "slug": "free-shipping-150",
        "code": null,
        "type": "FREE_SHIPPING",
        "stackingRule": "STACKABLE_WITH_OTHERS",
        "isAutomatic": true,
        "discountAmount": 0.00,
        "isFreeShipping": true,
        "freeShippingDiscount": 15.00,
        "matchedItemCount": 2,
        "description": "Automatic free shipping tier"
      }
    ],
    "itemAllocations": [
      {
        "productId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "variantId": "2c9b3c4a-6d8e-4a8a-9f5b-1c3d5e7f9a1b",
        "productName": "Nike Running Shoes",
        "originalLineTotal": 240.00,
        "discountAmount": 48.00,
        "finalLineTotal": 192.00,
        "appliedPromotionId": "11111111-2222-3333-4444-555555555555",
        "appliedPromotionName": "Summer 20% Off"
      },
      {
        "productId": "7d3b3dcb-6d2a-4bad-9bdd-9b1deb4d3b7d",
        "productName": "Nike Sports Socks",
        "originalLineTotal": 15.00,
        "discountAmount": 3.00,
        "finalLineTotal": 12.00,
        "appliedPromotionId": "11111111-2222-3333-4444-555555555555",
        "appliedPromotionName": "Summer 20% Off"
      }
    ]
  }
}
```

---

### 2. Validate Promo Code (`POST /validate-code`)

* **Authentication**: Optional
* **Summary**: Verifies if an individual promo code is active, eligible, and within limit.

#### Request Payload
```json
{
  "code": "FLASH50",
  "subtotal": 120.00
}
```

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "valid": true,
    "promotion": {
      "id": "e4a2e5d6-8b1c-4f9a-9e2b-1a3c5e7f9a1b",
      "name": "Flash Sale 50%",
      "code": "FLASH50",
      "type": "FLASH_SALE",
      "discountValue": "50.00",
      "minOrderSubtotal": "100.00"
    }
  }
}
```

---

### 3. Active Public Banners (`GET /active`)

* **Authentication**: Public
* **Summary**: Lists currently active automatic promotions and sales for storefront hero banners.

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": [
    {
      "id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
      "name": "Weekend Sneaker Sale",
      "slug": "weekend-sneakers",
      "description": "Get 15% off all footwear this weekend",
      "type": "CATEGORY_DISCOUNT",
      "discountValue": "15.00",
      "isAutomatic": true,
      "startsAt": "2026-09-19T00:00:00.000Z",
      "endsAt": "2026-09-22T23:59:59.000Z"
    }
  ]
}
```

---

### 4. My Redemption History (`GET /my-history`)

* **Authentication**: Required (`Bearer <Token>`)
* **Summary**: Customer views their own past promotion redemptions across orders.

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "usages": [
      {
        "id": "8b9a1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d",
        "promotionId": "11111111-2222-3333-4444-555555555555",
        "orderId": "55555555-6666-7777-8888-999999999999",
        "discountAmount": "51.00",
        "createdAt": "2026-09-20T06:30:00.000Z",
        "promotion": {
          "id": "11111111-2222-3333-4444-555555555555",
          "name": "Summer 20% Off",
          "slug": "summer-20",
          "code": "SUMMER20",
          "type": "PERCENTAGE"
        },
        "order": {
          "id": "55555555-6666-7777-8888-999999999999",
          "orderNumber": "ORD-20260920-0042",
          "grandTotal": "204.00",
          "createdAt": "2026-09-20T06:30:00.000Z"
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

## Administrative Management Endpoints

All admin endpoints require authentication and specific granular RBAC permissions.

### 5. List Promotions (`GET /`)

* **Authentication**: Admin Required
* **Permission**: `promotion:read`
* **Query Params**: `search`, `type`, `status`, `isAutomatic`, `customerSegment`, `page`, `limit`, `sortBy`, `sortOrder`

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "promotions": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "name": "Summer 20% Off",
        "slug": "summer-20",
        "code": "SUMMER20",
        "type": "PERCENTAGE",
        "status": "ACTIVE",
        "priority": 10,
        "isStackable": true,
        "isAutomatic": false,
        "discountValue": "20.00",
        "currentUsageCount": 48,
        "totalUsageLimit": 500,
        "_count": { "usages": 48 }
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

### 6. Get Promotion Details (`GET /:id`)

* **Authentication**: Admin Required
* **Permission**: `promotion:read`

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "id": "11111111-2222-3333-4444-555555555555",
    "name": "Summer 20% Off",
    "slug": "summer-20",
    "code": "SUMMER20",
    "type": "PERCENTAGE",
    "status": "ACTIVE",
    "priority": 10,
    "discountValue": "20.00",
    "maxDiscountAmount": "50.00",
    "minOrderSubtotal": "100.00",
    "currentUsageCount": 48,
    "creator": {
      "id": "admin-uuid",
      "firstName": "Super",
      "lastName": "Admin",
      "email": "admin@meeo.store"
    },
    "stats": {
      "totalRedemptions": 48,
      "totalDiscountGiven": 2448.00,
      "averageDiscount": 51.00,
      "recentUsages": []
    }
  }
}
```

---

### 7. Create Promotion (`POST /`)

* **Authentication**: Admin Required
* **Permission**: `promotion:create`

#### Request Payload
```json
{
  "name": "Buy 2 Get 1 Free Footwear",
  "slug": "b2g1-footwear",
  "description": "Buy 2 pairs of footwear and get the 3rd pair free",
  "type": "BUY_X_GET_Y",
  "status": "DRAFT",
  "priority": 15,
  "isStackable": true,
  "stackingRule": "STACKABLE_WITH_OTHERS",
  "isAutomatic": true,
  "customerSegment": "ALL",
  "buyXQuantity": 2,
  "getYQuantity": 1,
  "getYDiscountPercentage": 100,
  "targetCategoryIds": ["4a8e6d2c-9b1d-4bad-9bdd-3d7b3dcb6d2a"],
  "startsAt": "2026-10-01T00:00:00Z",
  "endsAt": "2026-10-15T23:59:59Z",
  "totalUsageLimit": 1000,
  "userUsageLimit": 2
}
```

#### Response Payload (`201 Created`)
```json
{
  "status": "success",
  "message": "Promotion \"Buy 2 Get 1 Free Footwear\" created successfully",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "name": "Buy 2 Get 1 Free Footwear",
    "slug": "b2g1-footwear",
    "status": "DRAFT",
    "type": "BUY_X_GET_Y",
    "priority": 15,
    "createdAt": "2026-09-20T06:50:00.000Z"
  }
}
```

---

### 8. Update Promotion (`PUT /:id`)

* **Authentication**: Admin Required
* **Permission**: `promotion:update`

#### Request Payload
```json
{
  "name": "Buy 2 Get 1 Free Premium Footwear",
  "priority": 25,
  "totalUsageLimit": 2000
}
```

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "message": "Promotion \"Buy 2 Get 1 Free Premium Footwear\" updated successfully",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "name": "Buy 2 Get 1 Free Premium Footwear",
    "priority": 25,
    "totalUsageLimit": 2000
  }
}
```

---

### 9. Publish Promotion (`PATCH /:id/publish`)

* **Authentication**: Admin Required
* **Permission**: `promotion:update`
* **Summary**: Transitions a DRAFT or SCHEDULED promotion into `ACTIVE` status and invalidates Redis cache.

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "message": "Promotion \"Buy 2 Get 1 Free Premium Footwear\" published to ACTIVE status",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "status": "ACTIVE"
  }
}
```

---

### 10. Pause Promotion (`PATCH /:id/pause`)

* **Authentication**: Admin Required
* **Permission**: `promotion:update`
* **Summary**: Temporarily deactivates campaign from being evaluated at checkout.

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "message": "Promotion \"Buy 2 Get 1 Free Premium Footwear\" status changed to PAUSED",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "status": "PAUSED"
  }
}
```

---

### 11. Archive Promotion (`PATCH /:id/archive`)

* **Authentication**: Admin Required
* **Permission**: `promotion:delete`
* **Summary**: Permanently deactivates and archives a campaign.

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "message": "Promotion \"Buy 2 Get 1 Free Premium Footwear\" archived successfully",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "status": "ARCHIVED"
  }
}
```

---

### 12. Toggle Status (`PATCH /:id/status`)

* **Authentication**: Admin Required
* **Permission**: `promotion:update`

#### Request Payload
```json
{
  "status": "SCHEDULED"
}
```

#### Response Payload (`200 OK`)
```json
{
  "status": "success",
  "message": "Promotion status set to SCHEDULED",
  "data": {
    "id": "99999999-8888-7777-6666-555555555555",
    "status": "SCHEDULED"
  }
}
```

---

## Redis Caching & Invalidation

* **Active Automatic Campaigns Key**: `meeo:promotions:active:automatic` (TTL: 300s)
* **Code-based Promotion Key**: `meeo:promotions:code:<PROMO_CODE>` (TTL: 300s)
* **Invalidation Events**:
  * Any create, update, publish, pause, or archive operation triggers automatic `promotionCacheService.invalidateAll()`.
  * If Redis experiences network errors or timeout, the engine transparently fails over to PostgreSQL query execution without interrupting checkout.

---

## Transactional Checkout Integration

During checkout (`POST /api/v1/orders/checkout`), the promotion engine is executed directly inside the order processing pipeline:

```typescript
// Atomic order creation in database transaction
await prisma.$transaction(async (tx) => {
    // 1. Create order record with final server-calculated grandTotal & discountTotal
    const order = await tx.order.create({ ... });

    // 2. Atomically record Promotion Usage logs
    for (const promo of promoResult.appliedPromotions) {
        await promotionUsageService.recordUsage(
            tx,
            promo.id,
            order.id,
            promo.discountAmount,
            userId,
        );
    }
});
```
