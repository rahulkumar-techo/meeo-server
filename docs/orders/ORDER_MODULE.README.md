# Orders & Fulfillment Module API Documentation

> **Base Route**: `/api/v1/orders`  
> **Route File**: [`src/modules/orders/routes/order.route.ts`](file:///e:/e-com/server/src/modules/orders/routes/order.route.ts)  
> **Controller**: [`src/modules/orders/controller/order.controller.ts`](file:///e:/e-com/server/src/modules/orders/controller/order.controller.ts)  
> **Services**: [`src/modules/orders/services/order.service.ts`](file:///e:/e-com/server/src/modules/orders/services/order.service.ts)  
> **Validations**: [`src/modules/orders/validations/order.validation.ts`](file:///e:/e-com/server/src/modules/orders/validations/order.validation.ts)  
> **Swagger Schemas**: [`src/common/docs/orderDocs.ts`](file:///e:/e-com/server/src/common/docs/orderDocs.ts)

---

## Table of Contents

1. [Architecture & Lifecycle Overview](#architecture--lifecycle-overview)
2. [Order Status State Machine](#order-status-state-machine)
3. [Authentication & Authorization](#authentication--authorization)
4. [Endpoints Summary](#endpoints-summary)
5. [Route Specifications & Scenarios](#route-specifications--scenarios)
   - [1. Preview Checkout Breakdown (`POST /validate-checkout`)](#1-preview-checkout-breakdown-post-validate-checkout)
   - [2. Transactional Checkout & Order Creation (`POST /checkout`)](#2-transactional-checkout--order-creation-post-checkout)
   - [3. List Customer Orders (`GET /`)](#3-list-customer-orders-get-)
   - [4. Get Order by UUID (`GET /:id`)](#4-get-order-by-uuid-get-id)
   - [5. Get Order by Human Order Number (`GET /number/:orderNumber`)](#5-get-order-by-human-order-number-get-numberordernumber)
   - [6. Cancel Order (`POST /:id/cancel`)](#6-cancel-order-post-idcancel)
   - [7. Confirm Order for Fulfillment (`POST /:id/confirm`)](#7-confirm-order-for-fulfillment-post-idconfirm)
   - [8. Move Order to Processing (`POST /:id/process`)](#8-move-order-to-processing-post-idprocess)
   - [9. Mark Order as Shipped (`POST /:id/ship`)](#9-mark-order-as-shipped-post-idship)
   - [10. Mark Order as Delivered (`POST /:id/deliver`)](#10-mark-order-as-delivered-post-iddeliver)
   - [11. Sweep and Expire Stale Orders (`POST /expire-stale`)](#11-sweep-and-expire-stale-orders-post-expire-stale)
   - [12. Admin List All Orders (`GET /admin`)](#12-admin-list-all-orders-get-admin)
   - [13. Admin Order & Fulfillment Metrics (`GET /admin/metrics`)](#13-admin-order--fulfillment-metrics-get-adminmetrics)
   - [14. Update Order Status Manually (`PATCH /:id/status`)](#14-update-order-status-manually-patch-idstatus)
6. [Standard Response & Error Formats](#standard-response--error-formats)

---

## Architecture & Lifecycle Overview

The Orders & Fulfillment module handles the entire checkout and order lifecycle:
- **Canonical Price Verification**: Prevents client-side price tampering by recalculating prices from product variant records.
- **Inventory Reservation**: Holds stock upon checkout; commits upon confirmation; releases upon cancellation or expiration.
- **Atomic Transactions**: Orders, snapshots, items, reservations, address copies, and coupon deductions are processed in single database transactions.
- **Idempotency Guard**: Prevents duplicate double-charges and double-orders via `Idempotency-Key` headers.
- **Transactional Outbox**: Emits asynchronous domain events (`ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, `ORDER_EXPIRED`) for email notifications, analytics, and external webhooks.

---

## Order Status State Machine

```
               ┌───────────────┐
               │    PENDING    │◀──────────────┐
               └───────┬───────┘               │
                       │                       │
                       ▼                       │
               ┌───────────────┐               │
               │PAYMENT_PENDING├───────────────┘
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │   CONFIRMED   │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │  PROCESSING   │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │    SHIPPED    │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │   DELIVERED   │
               └───────┬───────┘
                       │
                       ▼
               ┌───────────────┐
               │   REFUNDED    │ (Terminal)
               └───────────────┘

Terminal / Failure Branches:
- PENDING / PAYMENT_PENDING  ──▶ CANCELLED | EXPIRED
- CONFIRMED / PROCESSING     ──▶ CANCELLED | REFUNDED
- SHIPPED                    ──▶ CANCELLED | REFUNDED
```

---

## Authentication & Authorization

| Header | Required For | Description |
|---|---|---|
| `Authorization: Bearer <token>` | Authenticated & Admin Routes | User or Admin JSON Web Token |
| `Idempotency-Key: <uuid>` | Optional on `POST /checkout` | Unique request UUID for safe retry deduplication |
| `x-session-id: <session-token>` | Guest Checkout / Validate | Cart session tracking for unauthenticated visitors |

---

## Endpoints Summary

| Method | Endpoint | Access Level | Permission | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/orders/validate-checkout` | Public / User | None | Previews totals, shipping, taxes, discounts |
| `POST` | `/api/v1/orders/checkout` | Public / User | None | Creates order, reserves stock, applies coupons |
| `GET` | `/api/v1/orders` | Authenticated | None (Own orders) | List paginated customer orders |
| `GET` | `/api/v1/orders/:id` | Authenticated | Own OR `order:read` | Retrieve full order details by ID |
| `GET` | `/api/v1/orders/number/:orderNumber` | Authenticated | Own OR `order:read` | Retrieve order details by readable number |
| `POST` | `/api/v1/orders/:id/cancel` | Authenticated | Own OR `order:cancel` | Cancel order and release stock reservations |
| `POST` | `/api/v1/orders/:id/confirm` | Admin | `order:update` | Confirms pending order; commits inventory |
| `POST` | `/api/v1/orders/:id/process` | Admin | `order:update` | Moves order to warehouse picking/packaging |
| `POST` | `/api/v1/orders/:id/ship` | Admin | `order:update` | Attaches carrier tracking & marks as shipped |
| `POST` | `/api/v1/orders/:id/deliver` | Admin | `order:update` | Confirms final delivery to recipient |
| `POST` | `/api/v1/orders/expire-stale` | Admin / Cron | `order:update` | Auto-cancels abandoned pending checkouts |
| `GET` | `/api/v1/orders/admin` | Admin | `order:read` | List and search all platform orders |
| `GET` | `/api/v1/orders/admin/metrics` | Admin | `order:read` | Aggregated sales, fulfillment & AOV metrics |
| `PATCH` | `/api/v1/orders/:id/status` | Admin | `order:update` | Manual state machine transition |

---

## Route Specifications & Scenarios

---

### 1. Preview Checkout Breakdown (`POST /validate-checkout`)

Previews order calculations (subtotal, shipping fees, sales taxes, discount amounts, item availability) without reserving inventory or creating a database order.

- **Method**: `POST`
- **URL**: `/api/v1/orders/validate-checkout`
- **Access**: Public / Optional User (`app.optionalAuthenticate`)

#### Request Headers
```http
Content-Type: application/json
Authorization: Bearer <token> (Optional)
x-session-id: <guest-session-uuid> (Optional for guests)
```

#### Request Body
```json
{
  "cartId": "a1111111-2222-3333-4444-555555555555",
  "shippingAddressId": "b1111111-2222-3333-4444-555555555555",
  "shippingAddress": {
    "recipientName": "Jane Doe",
    "phone": "+1-555-0199",
    "addressLine1": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62704",
    "country": "USA"
  },
  "couponCode": "SAVE20",
  "currency": "USD"
}
```

#### Scenarios

##### Scenario 1.A: Success - Valid Breakdown Preview (`200 OK`)
```json
{
  "success": true,
  "message": "Checkout validated successfully",
  "data": {
    "isValid": true,
    "summary": {
      "itemCount": 2,
      "totalUnits": 3,
      "subtotal": 150.00,
      "discountTotal": 30.00,
      "shippingTotal": 10.00,
      "taxTotal": 9.60,
      "grandTotal": 139.60,
      "currency": "USD"
    },
    "coupon": {
      "code": "SAVE20",
      "type": "PERCENTAGE",
      "discountAmount": 30.00
    },
    "shippingAddress": {
      "recipientName": "Jane Doe",
      "addressLine1": "742 Evergreen Terrace",
      "city": "Springfield",
      "state": "IL",
      "postalCode": "62704",
      "country": "USA"
    },
    "items": [
      {
        "variantId": "c1111111-2222-3333-4444-555555555555",
        "productName": "Performance Running Shoes",
        "sku": "RUN-BLK-10",
        "quantity": 1,
        "unitPrice": 150.00,
        "totalPrice": 150.00
      }
    ]
  }
}
```

##### Scenario 1.B: Error - Empty Cart (`400 Bad Request`)
- **Cause**: The user's active cart has no items.
```json
{
  "success": false,
  "message": "Cannot checkout with an empty cart",
  "statusCode": 400
}
```

##### Scenario 1.C: Error - Insufficient Inventory (`400 Bad Request`)
- **Cause**: Requested cart quantity exceeds available unreserved warehouse stock.
```json
{
  "success": false,
  "message": "Insufficient stock for \"Performance Running Shoes (Size 10)\". Requested: 5, Available: 2",
  "statusCode": 400
}
```

##### Scenario 1.D: Error - Invalid or Expired Coupon (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Coupon code \"EXPIRED50\" has expired or reached maximum usage limit",
  "statusCode": 400
}
```

---

### 2. Transactional Checkout & Order Creation (`POST /checkout`)

Atomically creates the order within a database transaction: recalculates canonical prices, reserves variant inventory, deducts coupon usage counts, generates a unique human order number (e.g. `ORD-20260908-AB123`), snapshots address & line items, logs status history, and clears the cart.

- **Method**: `POST`
- **URL**: `/api/v1/orders/checkout`
- **Access**: Public / Optional User (`app.optionalAuthenticate`)

#### Request Headers
```http
Content-Type: application/json
Authorization: Bearer <token> (Optional for logged-in users)
idempotency-key: 9f82d5a3-7629-4ef2-bb17-7dbfa5e7d912 (Optional, recommended)
x-session-id: <guest-session-uuid> (Optional for guests)
```

#### Request Body
```json
{
  "cartId": "a1111111-2222-3333-4444-555555555555",
  "shippingAddressId": "b1111111-2222-3333-4444-555555555555",
  "shippingAddress": {
    "recipientName": "Jane Doe",
    "phone": "+1-555-0199",
    "addressLine1": "742 Evergreen Terrace",
    "addressLine2": "Apt 4B",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62704",
    "country": "USA"
  },
  "billingAddress": {
    "recipientName": "Jane Doe",
    "addressLine1": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "IL",
    "postalCode": "62704",
    "country": "USA"
  },
  "couponCode": "WELCOME10",
  "notes": "Leave package at front porch",
  "currency": "USD"
}
```

#### Scenarios

##### Scenario 2.A: Success - Order Placed (`201 Created`)
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "userId": "u1111111-2222-3333-4444-555555555555",
    "status": "PENDING",
    "currency": "USD",
    "subtotal": 120.00,
    "discountTotal": 12.00,
    "shippingTotal": 10.00,
    "taxTotal": 8.64,
    "grandTotal": 126.64,
    "notes": "Leave package at front porch",
    "shippingAddress": {
      "recipientName": "Jane Doe",
      "addressLine1": "742 Evergreen Terrace",
      "city": "Springfield",
      "state": "IL",
      "postalCode": "62704",
      "country": "USA"
    },
    "items": [
      {
        "id": "i1111111-2222-3333-4444-555555555555",
        "variantId": "v1111111-2222-3333-4444-555555555555",
        "productName": "Wireless Noise-Canceling Headphones",
        "sku": "AUDIO-NC-BLK",
        "quantity": 1,
        "unitPrice": 120.00,
        "totalPrice": 120.00
      }
    ],
    "createdAt": "2026-09-08T12:00:00.000Z"
  }
}
```

##### Scenario 2.B: Success - Idempotent Replay (`201 Created`)
- **Trigger**: Client retries exact same request with the same `Idempotency-Key` header within the TTL window.
- **Behavior**: Returns the previously created order payload immediately without creating duplicate records or double-decrementing stock.

##### Scenario 2.C: Error - Concurrent Idempotent Request in Progress (`409 Conflict`)
```json
{
  "success": false,
  "message": "A checkout request with this Idempotency-Key is currently being processed. Please wait.",
  "statusCode": 409
}
```

##### Scenario 2.D: Error - Missing Delivery Address (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Either shippingAddressId or an inline shippingAddress must be provided",
  "statusCode": 400
}
```

---

### 3. List Customer Orders (`GET /`)

Retrieves a paginated list of orders placed by the authenticated customer.

- **Method**: `GET`
- **URL**: `/api/v1/orders`
- **Access**: Authenticated Customer (`app.authenticate`)

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page (1–100) |
| `status` | `string` | No | - | Filter by status (`PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`) |
| `search` | `string` | No | - | Search by order number |
| `startDate` | `ISO 8601` | No | - | Orders placed on or after timestamp |
| `endDate` | `ISO 8601` | No | - | Orders placed on or before timestamp |

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": {
    "items": [
      {
        "id": "e4444444-5555-6666-7777-888888888888",
        "orderNumber": "ORD-20260908-4B9F1",
        "status": "CONFIRMED",
        "grandTotal": 126.64,
        "currency": "USD",
        "itemCount": 1,
        "createdAt": "2026-09-08T12:00:00.000Z"
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

##### Scenario 3.B: Error - Unauthenticated (`401 Unauthorized`)
```json
{
  "success": false,
  "message": "Authorization token required",
  "statusCode": 401
}
```

---

### 4. Get Order by UUID (`GET /:id`)

Retrieves full order details including address snapshot, line items, and audit status history.

- **Method**: `GET`
- **URL**: `/api/v1/orders/:id`
- **Access**: Authenticated Customer (Own order) **OR** Admin (`order:read` / `SUPER_ADMIN`)

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Target order unique identifier |

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order retrieved successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "userId": "u1111111-2222-3333-4444-555555555555",
    "status": "PROCESSING",
    "currency": "USD",
    "subtotal": 120.00,
    "discountTotal": 12.00,
    "shippingTotal": 10.00,
    "taxTotal": 8.64,
    "grandTotal": 126.64,
    "address": {
      "recipientName": "Jane Doe",
      "addressLine1": "742 Evergreen Terrace",
      "city": "Springfield",
      "country": "USA"
    },
    "items": [
      {
        "id": "i1111111-2222-3333-4444-555555555555",
        "productName": "Wireless Noise-Canceling Headphones",
        "sku": "AUDIO-NC-BLK",
        "quantity": 1,
        "unitPrice": 120.00,
        "totalPrice": 120.00
      }
    ],
    "statusHistory": [
      {
        "previousStatus": "CONFIRMED",
        "newStatus": "PROCESSING",
        "reason": "Warehouse packaging in progress",
        "createdAt": "2026-09-08T13:00:00.000Z"
      },
      {
        "previousStatus": "PENDING",
        "newStatus": "CONFIRMED",
        "reason": "Payment verified",
        "createdAt": "2026-09-08T12:05:00.000Z"
      }
    ]
  }
}
```

##### Scenario 4.B: Error - Cross-Customer Unauthorized Access (`404 Not Found`)
- **Cause**: Customer attempts to view another user's order without admin privileges (masked as 404 for security).
```json
{
  "success": false,
  "message": "Order not found",
  "statusCode": 404
}
```

##### Scenario 4.C: Error - Invalid UUID (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Invalid order ID format",
  "statusCode": 400
}
```

---

### 5. Get Order by Human Order Number (`GET /number/:orderNumber`)

Retrieves full order details using the human-readable order number string.

- **Method**: `GET`
- **URL**: `/api/v1/orders/number/:orderNumber`
- **Access**: Authenticated Customer (Own order) **OR** Admin (`order:read`)

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderNumber` | `string` | Yes | Human-readable order number (e.g. `ORD-20260908-4B9F1`) |

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
- Returns the complete order object formatted identical to `GET /:id`.

##### Scenario 5.B: Error - Order Number Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Order \"ORD-INVALID-999\" not found",
  "statusCode": 404
}
```

---

### 6. Cancel Order (`POST /:id/cancel`)

Cancels an order and automatically restores all active inventory reservations back to available warehouse stock.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/cancel`
- **Access**: Authenticated Owner **OR** Admin (`order:cancel` / `SUPER_ADMIN`)

#### Request Body
```json
{
  "reason": "Customer requested cancellation before shipment"
}
```

#### Scenarios

##### Scenario 6.A: Success - Order Cancelled & Inventory Restored (`200 OK`)
```json
{
  "success": true,
  "message": "Order cancelled successfully and inventory holds released",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "status": "CANCELLED"
  }
}
```

##### Scenario 6.B: Error - Order Already Shipped/Delivered (`400 Bad Request`)
- **Cause**: Customer attempts to cancel an order that has already transitioned to `DELIVERED` or `CANCELLED`.
```json
{
  "success": false,
  "message": "Invalid order status transition from \"DELIVERED\" to \"CANCELLED\". Allowed transitions from \"DELIVERED\": [REFUNDED]",
  "statusCode": 400
}
```

---

### 7. Confirm Order for Fulfillment (`POST /:id/confirm`)

Transitions a `PENDING` or `PAYMENT_PENDING` order to `CONFIRMED`, committing reserved stock into permanent sales.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/confirm`
- **Access**: Admin with `order:update` permission

#### Scenarios

##### Scenario 7.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order confirmed successfully for fulfillment",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "status": "CONFIRMED"
  }
}
```

##### Scenario 7.B: Error - Invalid Transition State (`400 Bad Request`)
- **Cause**: Order is already in `SHIPPED` or `CANCELLED` status.
```json
{
  "success": false,
  "message": "Cannot confirm order in \"SHIPPED\" status. Order must be PENDING or PAYMENT_PENDING.",
  "statusCode": 400
}
```

##### Scenario 7.C: Error - Missing Permission (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Forbidden: Required permission 'order:update' missing",
  "statusCode": 403
}
```

---

### 8. Move Order to Processing (`POST /:id/process`)

Transitions a `CONFIRMED` order to `PROCESSING` for warehouse picking, packing, and staging.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/process`
- **Access**: Admin with `order:update` permission

#### Scenarios

##### Scenario 8.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order moved to warehouse processing",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "status": "PROCESSING"
  }
}
```

##### Scenario 8.B: Error - Unconfirmed Order (`400 Bad Request`)
- **Cause**: Order is still `PENDING` without confirmation.
```json
{
  "success": false,
  "message": "Invalid order status transition from \"PENDING\" to \"PROCESSING\". Allowed transitions from \"PENDING\": [PAYMENT_PENDING, CONFIRMED, CANCELLED, EXPIRED]",
  "statusCode": 400
}
```

---

### 9. Mark Order as Shipped (`POST /:id/ship`)

Transitions a `PROCESSING` order to `SHIPPED` and logs carrier logistics tracking details.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/ship`
- **Access**: Admin with `order:update` permission

#### Request Body
```json
{
  "carrier": "FedEx",
  "trackingNumber": "FDX-9988776655",
  "trackingUrl": "https://www.fedex.com/fedextrack/?trknbr=9988776655",
  "estimatedDeliveryAt": "2026-09-12T18:00:00.000Z",
  "notes": "Dispatched via Express Overnight Air"
}
```

#### Scenarios

##### Scenario 9.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order marked as shipped",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "status": "SHIPPED",
    "shipment": {
      "carrier": "FedEx",
      "trackingNumber": "FDX-9988776655",
      "trackingUrl": "https://www.fedex.com/fedextrack/?trknbr=9988776655",
      "estimatedDeliveryAt": "2026-09-12T18:00:00.000Z",
      "shippedAt": "2026-09-08T14:30:00.000Z"
    }
  }
}
```

##### Scenario 9.B: Error - Missing Required Carrier / Tracking (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Tracking number is required",
  "statusCode": 400
}
```

---

### 10. Mark Order as Delivered (`POST /:id/deliver`)

Transitions a `SHIPPED` order to `DELIVERED` upon courier delivery confirmation.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/deliver`
- **Access**: Admin with `order:update` permission

#### Request Body
```json
{
  "receivedBy": "Jane Doe (Signed at door)",
  "deliveryNotes": "Delivered to front porch reception"
}
```

#### Scenarios

##### Scenario 10.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order marked as delivered successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "status": "DELIVERED"
  }
}
```

---

### 11. Sweep and Expire Stale Orders (`POST /expire-stale`)

Batch sweeper endpoint (invoked by cron worker or admin) that identifies unconfirmed `PENDING` checkouts older than a specified duration, transitions them to `EXPIRED`, and restores held inventory.

- **Method**: `POST`
- **URL**: `/api/v1/orders/expire-stale`
- **Access**: Admin / Automation Worker with `order:update` permission

#### Request Body
```json
{
  "olderThanMinutes": 30
}
```

#### Scenarios

##### Scenario 11.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Stale orders sweep completed. Expired 4 orders.",
  "data": {
    "expiredCount": 4,
    "cutoffTime": "2026-09-08T11:30:00.000Z",
    "expiredOrderIds": [
      "e4444444-5555-6666-7777-888888888888",
      "e7777777-8888-9999-0000-111111111111"
    ]
  }
}
```

---

### 12. Admin List All Orders (`GET /admin`)

Admin order search with user information, delivery address search, status filters, and pagination.

- **Method**: `GET`
- **URL**: `/api/v1/orders/admin`
- **Access**: Admin with `order:read` permission

#### Query Parameters
| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Max items per page (1–100) |
| `status` | `enum` | - | Filter by status (`PENDING`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED`, `REFUNDED`) |
| `search` | `string` | - | Multi-field search matching order number, recipient name, or customer email |
| `startDate`| `ISO 8601` | - | Placed on or after timestamp |
| `endDate` | `ISO 8601` | - | Placed on or before timestamp |

#### Scenarios

##### Scenario 12.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "All orders retrieved successfully",
  "data": {
    "items": [
      {
        "id": "e4444444-5555-6666-7777-888888888888",
        "orderNumber": "ORD-20260908-4B9F1",
        "status": "PROCESSING",
        "grandTotal": 126.64,
        "currency": "USD",
        "user": {
          "id": "u1111111-2222-3333-4444-555555555555",
          "email": "customer@example.com",
          "firstName": "Jane",
          "lastName": "Doe"
        },
        "createdAt": "2026-09-08T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 450,
      "totalPages": 23
    }
  }
}
```

---

### 13. Admin Order & Fulfillment Metrics (`GET /admin/metrics`)

Aggregated dashboard metrics including total orders, gross revenue, average order value (AOV), breakdown count per status, and active fulfillments.

- **Method**: `GET`
- **URL**: `/api/v1/orders/admin/metrics`
- **Access**: Admin with `order:read` permission

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `startDate` | `ISO 8601` | No | Start of calculation window |
| `endDate` | `ISO 8601` | No | End of calculation window |

#### Scenarios

##### Scenario 13.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order metrics retrieved successfully",
  "data": {
    "totalOrders": 1240,
    "totalRevenue": 158420.50,
    "averageOrderValue": 127.76,
    "activeFulfillments": 42,
    "statusCounts": {
      "PENDING": 12,
      "PAYMENT_PENDING": 5,
      "CONFIRMED": 18,
      "PROCESSING": 24,
      "SHIPPED": 35,
      "DELIVERED": 1100,
      "CANCELLED": 38,
      "EXPIRED": 6,
      "REFUNDED": 2
    }
  }
}
```

---

### 14. Update Order Status Manually (`PATCH /:id/status`)

Explicit status transition endpoint with strict state-machine validation and audit trail logging.

- **Method**: `PATCH`
- **URL**: `/api/v1/orders/:id/status`
- **Access**: Admin with `order:update` permission

#### Request Body
```json
{
  "status": "REFUNDED",
  "reason": "Customer returned product; refund processed via Stripe"
}
```

#### Scenarios

##### Scenario 14.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order status updated to REFUNDED successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "status": "REFUNDED"
  }
}
```

##### Scenario 14.B: Error - Invalid State Transition (`400 Bad Request`)
- **Cause**: Attempting to move `CANCELLED` directly to `CONFIRMED`.
```json
{
  "success": false,
  "message": "Invalid order status transition from \"CANCELLED\" to \"CONFIRMED\". Allowed transitions from \"CANCELLED\": [None (terminal state)]",
  "statusCode": 400
}
```

---

## Standard Response & Error Formats

### Success Response (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "message": "Human-readable status description",
  "data": {}
}
```

### Error Response
```json
{
  "success": false,
  "message": "Descriptive error message",
  "statusCode": 400,
  "errors": []
}
```

| HTTP Status | Meaning | Typical Scenario |
|---|---|---|
| `200 OK` | Operation Successful | Queries, status updates, cancel, metrics |
| `201 Created` | Resource Created | Successful order creation via checkout |
| `400 Bad Request` | Validation / Logic Failure | Missing address, invalid status transition, empty cart, insufficient stock |
| `401 Unauthorized` | Missing / Invalid Token | Request to protected user/admin route without bearer token |
| `403 Forbidden` | Insufficient Permissions | User lacking `order:read` or `order:update` permission |
| `404 Not Found` | Resource Not Found | Order ID or number does not exist |
| `409 Conflict` | Concurrency Conflict | Concurrent checkout with identical `Idempotency-Key` in progress |
