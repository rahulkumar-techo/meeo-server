# Order Management Admin API Documentation

> **Base Route**: `/api/v1/orders`  
> **Route File**: [`src/modules/orders/routes/order.route.ts`](file:///e:/e-com/server/src/modules/orders/routes/order.route.ts)  
> **Controller**: [`src/modules/orders/controller/order.controller.ts`](file:///e:/e-com/server/src/modules/orders/controller/order.controller.ts)  
> **Target Audience**: Admin Dashboard, Back-office Operations, Fulfillment Staff & Automated Cron Sweepers

---

## Table of Contents

1. [Admin Roles & Required Permissions](#admin-roles--required-permissions)
2. [Admin Capabilities Overview](#admin-capabilities-overview)
3. [Admin Fulfillment Workflow & State Machine](#admin-fulfillment-workflow--state-machine)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. Admin List All Platform Orders (`GET /admin`)](#1-admin-list-all-platform-orders-get-admin)
   - [2. Admin Order & Fulfillment Analytics Metrics (`GET /admin/metrics`)](#2-admin-order--fulfillment-analytics-metrics-get-adminmetrics)
   - [3. Admin Inspect Order by UUID (`GET /:id`)](#3-admin-inspect-order-by-uuid-get-id)
   - [4. Admin Inspect Order by Order Number (`GET /number/:orderNumber`)](#4-admin-inspect-order-by-order-number-get-numberordernumber)
   - [5. Admin Confirm Order for Fulfillment (`POST /:id/confirm`)](#5-admin-confirm-order-for-fulfillment-post-idconfirm)
   - [6. Admin Move Order to Processing (`POST /:id/process`)](#6-admin-move-order-to-processing-post-idprocess)
   - [7. Admin Dispatch & Ship Order (`POST /:id/ship`)](#7-admin-dispatch--ship-order-post-idship)
   - [8. Admin Mark Order as Delivered (`POST /:id/deliver`)](#8-admin-mark-order-as-delivered-post-iddeliver)
   - [9. Admin Manual State Machine Transition (`PATCH /:id/status`)](#9-admin-manual-state-machine-transition-patch-idstatus)
   - [10. Admin Cancel Order & Release Stock (`POST /:id/cancel`)](#10-admin-cancel-order--release-stock-post-idcancel)
   - [11. Admin / Cron Sweep Stale Orders (`POST /expire-stale`)](#11-admin--cron-sweep-stale-orders-post-expire-stale)
6. [Security & Error Codes Reference](#security--error-codes-reference)

---

## Admin Roles & Required Permissions

All admin routes require an `Authorization: Bearer <token>` header belonging to a user with the `SUPER_ADMIN` role **OR** the specific granular permission constants:

| Permission Constant | Description | Operations Authorized |
|---|---|---|
| `PERMISSIONS.ORDER_READ` (`order:read`) | Read access to all orders and metrics | View global order list, search customers, view order metrics, inspect any customer order |
| `PERMISSIONS.ORDER_UPDATE` (`order:update`) | Update access to order status and logistics | Confirm orders, process, ship with tracking, mark delivered, trigger expiration sweep, manual status transitions |
| `PERMISSIONS.ORDER_CANCEL` (`order:cancel`) | Cancellation rights | Cancel any customer order and release inventory hold |
| Role: `SUPER_ADMIN` | Global super administrator | Full access across all read, update, cancel, and sweep endpoints |

---

## Admin Capabilities Overview

```
                      ┌─────────────────────────────────────────┐
                      │          ADMIN CAPABILITIES             │
                      └────────────────────┬────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│   QUERY & READ   │             │   FULFILLMENT    │             │ CANCELLATIONS &  │
│                  │             │   & LOGISTICS    │             │   MAINTENANCE    │
├──────────────────┤             ├──────────────────┤             ├──────────────────┤
│• Global Search   │             │• Confirm Order   │             │• Cancel Order    │
│• Customer Filter │             │• Move to Process │             │• Expire Stale    │
│• Status Filter   │             │• Attach Carrier  │             │• Release Holds   │
│• Sales Metrics   │             │• Tracking Number │             │• Refund State    │
│• Revenue / AOV   │             │• Mark Delivered  │             │• Audit Logs      │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

---

## Admin Fulfillment Workflow & State Machine

```
[Customer Checkout] ──▶ PENDING / PAYMENT_PENDING
                              │
                    (POST /:id/confirm)
                              ▼
                          CONFIRMED (Stock Committed)
                              │
                    (POST /:id/process)
                              ▼
                         PROCESSING (Warehouse Picking/Packing)
                              │
                     (POST /:id/ship)
                              ▼
                          SHIPPED (Carrier + Tracking AWB Attached)
                              │
                    (POST /:id/deliver)
                              ▼
                          DELIVERED (Proof / Recipient Signed)
                              │
                    (PATCH /:id/status -> REFUNDED)
                              ▼
                          REFUNDED (Terminal State)

[Cancellation / Expiration Branches]:
• Any unfulfilled status ──(POST /:id/cancel)──▶ CANCELLED (Inventory Released)
• Unpaid stale checkout  ──(POST /expire-stale)──▶ EXPIRED (Inventory Released)
```

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/orders/admin` | `order:read` | List & search all platform orders with customer info |
| `GET` | `/api/v1/orders/admin/metrics` | `order:read` | Order analytics: Revenue, AOV, status distribution |
| `GET` | `/api/v1/orders/:id` | `order:read` | Inspect any customer's full order details by UUID |
| `GET` | `/api/v1/orders/number/:orderNumber` | `order:read` | Inspect order details by human order number |
| `POST` | `/api/v1/orders/:id/confirm` | `order:update` | Confirms pending order; commits reserved inventory |
| `POST` | `/api/v1/orders/:id/process` | `order:update` | Moves order to warehouse picking and packing |
| `POST` | `/api/v1/orders/:id/ship` | `order:update` | Ships order with courier name and tracking number |
| `POST` | `/api/v1/orders/:id/deliver` | `order:update` | Marks order as delivered with proof of delivery |
| `PATCH` | `/api/v1/orders/:id/status` | `order:update` | Manual state machine transition with audit reason |
| `POST` | `/api/v1/orders/:id/cancel` | `order:cancel` | Cancels order & automatically restores reserved stock |
| `POST` | `/api/v1/orders/expire-stale` | `order:update` | Batch sweeps & expires abandoned pending checkouts |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. Admin List All Platform Orders (`GET /admin`)

Retrieves a paginated list of all customer orders across the platform with customer user data (`id`, `email`, `firstName`, `lastName`), address snapshots, status history, and multi-field search.

- **Method**: `GET`
- **URL**: `/api/v1/orders/admin`
- **Permission**: `order:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page (1–100) |
| `search` | `string` | No | - | Multi-field search matching order number, customer email, or recipient delivery name |
| `status` | `enum` | No | - | `PENDING`, `PAYMENT_PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `EXPIRED`, `REFUNDED` |
| `startDate` | `ISO 8601` | No | - | Filter orders placed on or after timestamp |
| `endDate` | `ISO 8601` | No | - | Filter orders placed on or before timestamp |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "All orders retrieved successfully",
  "data": {
    "items": [
      {
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
        "notes": "Leave package at front porch",
        "user": {
          "id": "u1111111-2222-3333-4444-555555555555",
          "email": "customer@example.com",
          "firstName": "Jane",
          "lastName": "Doe"
        },
        "address": {
          "recipientName": "Jane Doe",
          "phone": "+1-555-0199",
          "addressLine1": "742 Evergreen Terrace",
          "city": "Springfield",
          "state": "IL",
          "postalCode": "62704",
          "country": "USA"
        },
        "itemCount": 1,
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

##### Scenario 1.B: Error - Missing Permission (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Forbidden: Required permission 'order:read' missing",
  "statusCode": 403
}
```

---

### 2. Admin Order & Fulfillment Analytics Metrics (`GET /admin/metrics`)

Aggregates operational metrics for admin dashboard cards, fulfillment pipeline monitoring, and financial summaries.

- **Method**: `GET`
- **URL**: `/api/v1/orders/admin/metrics`
- **Permission**: `order:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `startDate` | `ISO 8601` | No | Window start timestamp |
| `endDate` | `ISO 8601` | No | Window end timestamp |

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
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

### 3. Admin Inspect Order by UUID (`GET /:id`)

Retrieves full order specifications including item snapshots, delivery addresses, status history, and payment information. Admins can inspect any user's order.

- **Method**: `GET`
- **URL**: `/api/v1/orders/:id`
- **Permission**: `order:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
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
    "items": [
      {
        "id": "item-1111-2222-3333-4444",
        "variantId": "var-9999-8888-7777",
        "productName": "Wireless Headphones",
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
        "changedBy": "admin-uuid-1234",
        "createdAt": "2026-09-08T13:00:00.000Z"
      }
    ]
  }
}
```

##### Scenario 3.B: Error - Order Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Order not found",
  "statusCode": 404
}
```

---

### 4. Admin Inspect Order by Order Number (`GET /number/:orderNumber`)

Retrieves full order details using the human-readable order number.

- **Method**: `GET`
- **URL**: `/api/v1/orders/number/:orderNumber`
- **Permission**: `order:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
- Returns the complete order object formatted identical to `GET /:id`.

---

### 5. Admin Confirm Order for Fulfillment (`POST /:id/confirm`)

Confirms a `PENDING` or `PAYMENT_PENDING` order, permanently converting active stock reservation holds into confirmed sales and logging inventory audit ledger entries.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/confirm`
- **Permission**: `order:update` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
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

##### Scenario 5.B: Error - Order Not in Confirmable Status (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Cannot confirm order in \"SHIPPED\" status. Order must be PENDING or PAYMENT_PENDING.",
  "statusCode": 400
}
```

---

### 6. Admin Move Order to Processing (`POST /:id/process`)

Transitions a `CONFIRMED` order to `PROCESSING` status for warehouse staff to begin picking and packaging.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/process`
- **Permission**: `order:update` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order moved to warehouse processing",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "status": "PROCESSING"
  }
}
```

---

### 7. Admin Dispatch & Ship Order (`POST /:id/ship`)

Transitions a `PROCESSING` order to `SHIPPED` and attaches logistics tracking data.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/ship`
- **Permission**: `order:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "carrier": "FedEx",
  "trackingNumber": "FDX-9988776655",
  "trackingUrl": "https://www.fedex.com/fedextrack/?trknbr=9988776655",
  "estimatedDeliveryAt": "2026-09-12T18:00:00.000Z",
  "notes": "Dispatched from East Coast Distribution Center"
}
```

#### Scenarios

##### Scenario 7.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order marked as shipped",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
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

##### Scenario 7.B: Error - Missing Required Tracking Number (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Tracking number is required",
  "statusCode": 400
}
```

---

### 8. Admin Mark Order as Delivered (`POST /:id/deliver`)

Transitions a `SHIPPED` order to `DELIVERED` with delivery proof and recipient acknowledgment.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/deliver`
- **Permission**: `order:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "receivedBy": "Jane Doe (Signed at door)",
  "deliveryNotes": "Delivered to reception desk / porch"
}
```

#### Scenarios

##### Scenario 8.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order marked as delivered successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "orderNumber": "ORD-20260908-4B9F1",
    "status": "DELIVERED"
  }
}
```

---

### 9. Admin Manual State Machine Transition (`PATCH /:id/status`)

Directly triggers a lifecycle status update with state machine validation, inventory release (if cancelling), and audit reason logging.

- **Method**: `PATCH`
- **URL**: `/api/v1/orders/:id/status`
- **Permission**: `order:update` or `SUPER_ADMIN`

#### Request Body
```json
{
  "status": "REFUNDED",
  "reason": "Customer returned merchandise; Stripe refund issued"
}
```

#### Scenarios

##### Scenario 9.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order status updated to REFUNDED successfully",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "status": "REFUNDED"
  }
}
```

##### Scenario 9.B: Error - Invalid Transition (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Invalid order status transition from \"CANCELLED\" to \"CONFIRMED\". Allowed transitions from \"CANCELLED\": [None (terminal state)]",
  "statusCode": 400
}
```

---

### 10. Admin Cancel Order & Release Stock (`POST /:id/cancel`)

Cancels an order and automatically releases all active inventory reservation holds back to warehouse stock.

- **Method**: `POST`
- **URL**: `/api/v1/orders/:id/cancel`
- **Permission**: `order:cancel` or `SUPER_ADMIN`

#### Request Body
```json
{
  "reason": "Fraudulent order detected by security verification"
}
```

#### Scenarios

##### Scenario 10.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Order cancelled successfully and inventory holds released",
  "data": {
    "id": "e4444444-5555-6666-7777-888888888888",
    "status": "CANCELLED"
  }
}
```

---

### 11. Admin / Cron Sweep Stale Orders (`POST /expire-stale`)

Sweeper endpoint used by scheduled cron workers or admin operations to expire unconfirmed checkouts older than a given duration and restore held stock.

- **Method**: `POST`
- **URL**: `/api/v1/orders/expire-stale`
- **Permission**: `order:update` or `SUPER_ADMIN`

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
  "message": "Stale orders sweep completed. Expired 3 orders.",
  "data": {
    "expiredCount": 3,
    "cutoffTime": "2026-09-08T11:30:00.000Z",
    "expiredOrderIds": [
      "e4444444-5555-6666-7777-888888888888",
      "e7777777-8888-9999-0000-111111111111"
    ]
  }
}
```

---

## Security & Error Codes Reference

| HTTP Status | Reason | Typical Cause |
|---|---|---|
| `200 OK` | Operation Succeeded | Successful query, status update, confirmation, delivery, or sweep |
| `400 Bad Request` | Validation / Transition Error | Missing tracking number, invalid state transition, negative parameter |
| `401 Unauthorized` | Missing / Invalid Token | Missing `Authorization: Bearer <token>` |
| `403 Forbidden` | Missing Permission | User lacks `order:read`, `order:update`, or `order:cancel` permission |
| `404 Not Found` | Entity Missing | Order UUID or order number does not exist |
