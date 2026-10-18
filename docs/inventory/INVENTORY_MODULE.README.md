# Inventory Management Module API Documentation

> **Base Route**: `/api/v1/inventory`  
> **Route File**: [`src/modules/inventory/routes/inventory.route.ts`](file:///e:/e-com/server/src/modules/inventory/routes/inventory.route.ts)  
> **Controller**: [`src/modules/inventory/controller/inventory.controller.ts`](file:///e:/e-com/server/src/modules/inventory/controller/inventory.controller.ts)  
> **Services**: [`src/modules/inventory/services/inventory.service.ts`](file:///e:/e-com/server/src/modules/inventory/services/inventory.service.ts)  
> **Validations**: [`src/modules/inventory/validations/inventory.validation.ts`](file:///e:/e-com/server/src/modules/inventory/validations/inventory.validation.ts)  
> **Swagger Schemas**: [`src/common/docs/inventory.ts`](file:///e:/e-com/server/src/common/docs/inventory.ts)

---

## Table of Contents

1. [Architecture & Stock Lifecycle Overview](#architecture--stock-lifecycle-overview)
2. [Reservation State Machine & Stock Invariants](#reservation-state-machine--stock-invariants)
3. [Authentication & Authorization](#authentication--authorization)
4. [Endpoints Summary](#endpoints-summary)
5. [Route Specifications & Scenarios](#route-specifications--scenarios)
   - [1. Get Variant Inventory (`GET /variant/:variantId`)](#1-get-variant-inventory-get-variantvariantid)
   - [2. List All Inventory Levels (`GET /`)](#2-list-all-inventory-levels-get-)
   - [3. Get Low Stock Alerts (`GET /low-stock`)](#3-get-low-stock-alerts-get-low-stock)
   - [4. Add Physical Stock (`POST /add-stock`)](#4-add-physical-stock-post-add-stock)
   - [5. Remove Stock / Write-Off (`POST /remove-stock`)](#5-remove-stock--write-off-post-remove-stock)
   - [6. Manual Stock Count Adjustment (`POST /adjust`)](#6-manual-stock-count-adjustment-post-adjust)
   - [7. Query Immutable Transaction Audit Ledger (`GET /transactions`)](#7-query-immutable-transaction-audit-ledger-get-transactions)
   - [8. Reserve Stock for Checkout (`POST /reservations/reserve`)](#8-reserve-stock-for-checkout-post-reservationsreserve)
   - [9. Confirm Reservation on Payment (`POST /reservations/:id/confirm`)](#9-confirm-reservation-on-payment-post-reservationsidconfirm)
   - [10. Release Stock Reservation (`POST /reservations/:id/release`)](#10-release-stock-reservation-post-reservationsidrelease)
   - [11. Cleanup Expired Stale Reservations (`POST /reservations/cleanup-expired`)](#11-cleanup-expired-stale-reservations-post-reservationscleanup-expired)
   - [12. Simulate Checkout & Payment Flow (`POST /checkout/simulate`)](#12-simulate-checkout--payment-flow-post-checkoutsimulate)
6. [Standard Response & Error Formats](#standard-response--error-formats)

---

## Architecture & Stock Lifecycle Overview

The Inventory module guarantees stock consistency, overselling protection, and immutable auditability:
- **Available vs. Reserved Stock**: `totalStock = availableQuantity + reservedQuantity`. Stock available for purchases is strictly `availableQuantity`.
- **Checkout Reservations**: During customer checkout, items are held in `ACTIVE` reservation state with a configurable TTL (default 15 minutes), decrementing `availableQuantity` and incrementing `reservedQuantity`.
- **Commit or Release**:
  - Payment success transitions reservation to `CONFIRMED`, permanently committing stock into sold goods (`reservedQuantity` decremented, `ORDER_CONFIRMED` ledger entry).
  - Payment cancellation or timeout transitions reservation to `RELEASED` or `EXPIRED`, restoring units back to `availableQuantity`.
- **Immutable Transaction Ledger**: Every single stock movement (`STOCK_ADDED`, `STOCK_REMOVED`, `ORDER_RESERVED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `RETURNED`, `MANUAL_ADJUSTMENT`) logs an immutable entry with variant ID, quantity, note, and reference IDs.
- **Concurrency & Atomicity**: All multi-step adjustments execute in Prisma database transactions with atomic increments/decrements.

---

## Reservation State Machine & Stock Invariants

```
                             ┌───────────────────┐
                             │  [Stock Available]│
                             └─────────┬─────────┘
                                       │
                         POST /reservations/reserve
                                       │
                                       ▼
                             ┌───────────────────┐
                             │   ACTIVE (Hold)   │
                             └────┬─────────┬────┘
                                  │         │
          POST /reservations/     │         │ POST /reservations/
             :id/confirm          │         │    :id/release OR
                                  │         │    cleanup-expired
                                  ▼         ▼
                        ┌───────────┐     ┌───────────┐
                        │ CONFIRMED │     │ RELEASED/ │
                        │  (Sold)   │     │  EXPIRED  │
                        └───────────┘     │(Restored) │
                                          └───────────┘
```

---

## Authentication & Authorization

| Header | Required For | Description |
|---|---|---|
| `Authorization: Bearer <accessToken>` | All Routes | Valid JSON Web Token (User or Admin) |

### Permission Matrix

| Permission | Operations Allowed |
|---|---|
| `inventory:read` | View stock levels, low-stock alerts, audit transaction ledgers |
| `inventory:update` | Add stock, remove stock, manual count adjustments, confirm reservations, run expired reservation sweepers |
| Authenticated User | Reserve stock for own checkout, release own reservation, run checkout flow simulations |

---

## Endpoints Summary

| Method | Endpoint | Access Level | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/inventory/variant/:variantId` | Admin | `inventory:read` | Retrieves stock counts for a specific variant |
| `GET` | `/api/v1/inventory` | Admin | `inventory:read` | Lists all variant inventory levels with search & pagination |
| `GET` | `/api/v1/inventory/low-stock` | Admin | `inventory:read` | Lists variants at or below their reorder threshold |
| `POST` | `/api/v1/inventory/add-stock` | Admin | `inventory:update` | Adds physical inventory units with audit ledger logging |
| `POST` | `/api/v1/inventory/remove-stock` | Admin | `inventory:update` | Removes stock (damage/shrinkage) with overselling guard |
| `POST` | `/api/v1/inventory/adjust` | Admin | `inventory:update` | Sets exact stock count or adjusts reorder alert level |
| `GET` | `/api/v1/inventory/transactions` | Admin | `inventory:read` | Paginated immutable audit ledger of all stock movements |
| `POST` | `/api/v1/inventory/reservations/reserve` | Authenticated | None | Holds stock for checkout with TTL expiration |
| `POST` | `/api/v1/inventory/reservations/:id/confirm` | Admin | `inventory:update` | Commits reservation to permanent sale on payment success |
| `POST` | `/api/v1/inventory/reservations/:id/release` | Authenticated | None | Releases hold and restores available stock pool |
| `POST` | `/api/v1/inventory/reservations/cleanup-expired` | Admin | `inventory:update` | Sweeper to auto-release expired stale checkout holds |
| `POST` | `/api/v1/inventory/checkout/simulate` | Authenticated | None | Simulates full end-to-end reserve -> pay -> confirm/release flow |

---

## Route Specifications & Scenarios

---

### 1. Get Variant Inventory (`GET /variant/:variantId`)

Retrieves available, reserved, and total stock counts for a product variant. Auto-initializes an inventory record if none exists.

- **Method**: `GET`
- **URL**: `/api/v1/inventory/variant/:variantId`
- **Access**: Admin (`inventory:read` or `SUPER_ADMIN`)

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `variantId` | `UUID` | Yes | Target product variant ID |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Inventory retrieved successfully",
  "data": {
    "id": "inv-11111111-2222-3333-4444-555555555555",
    "variantId": "var-99999999-8888-7777-6666-555555555555",
    "availableQuantity": 45,
    "reservedQuantity": 5,
    "reorderLevel": 10,
    "totalStock": 50,
    "isLowStock": false,
    "variant": {
      "id": "var-99999999-8888-7777-6666-555555555555",
      "sku": "TSHIRT-BLK-M",
      "barcode": "8901234567890",
      "price": 29.99,
      "product": {
        "id": "prod-11111111-2222-3333-4444-555555555555",
        "name": "Classic Crewneck T-Shirt",
        "slug": "classic-crewneck-t-shirt"
      }
    },
    "createdAt": "2026-09-01T10:00:00.000Z",
    "updatedAt": "2026-09-08T12:00:00.000Z"
  }
}
```

##### Scenario 1.B: Error - Product Variant Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Product variant not found",
  "statusCode": 404
}
```

##### Scenario 1.C: Error - Missing Permission (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Forbidden: Required permission 'inventory:read' missing",
  "statusCode": 403
}
```

---

### 2. List All Inventory Levels (`GET /`)

Lists all inventory records across the catalog with search (SKU, barcode, product name), low-stock filtering, and pagination.

- **Method**: `GET`
- **URL**: `/api/v1/inventory`
- **Access**: Admin (`inventory:read` or `SUPER_ADMIN`)

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |
| `search` | `string` | No | - | Matches SKU, barcode, or product name |
| `lowStockOnly` | `boolean` | No | `false` | When `true`, filters only items where available <= reorderLevel |

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Inventories retrieved successfully",
  "data": {
    "items": [
      {
        "id": "inv-11111111-2222-3333-4444-555555555555",
        "variantId": "var-99999999-8888-7777-6666-555555555555",
        "availableQuantity": 3,
        "reservedQuantity": 2,
        "reorderLevel": 10,
        "totalStock": 5,
        "isLowStock": true,
        "variant": {
          "id": "var-99999999-8888-7777-6666-555555555555",
          "sku": "HOODIE-RED-XL",
          "product": {
            "id": "prod-22222222-3333-4444-5555-666666666666",
            "name": "Heavyweight Fleece Hoodie",
            "slug": "heavyweight-fleece-hoodie"
          }
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

### 3. Get Low Stock Alerts (`GET /low-stock`)

Retrieves urgent stock replenishment candidates where `availableQuantity <= reorderLevel`.

- **Method**: `GET`
- **URL**: `/api/v1/inventory/low-stock`
- **Access**: Admin (`inventory:read` or `SUPER_ADMIN`)

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Low stock alerts retrieved successfully",
  "data": [
    {
      "id": "inv-11111111-2222-3333-4444-555555555555",
      "variantId": "var-99999999-8888-7777-6666-555555555555",
      "availableQuantity": 2,
      "reservedQuantity": 1,
      "reorderLevel": 10,
      "shortage": 8,
      "variant": {
        "sku": "RUN-SHOE-10",
        "product": {
          "name": "Marathon Elite Running Shoes"
        }
      }
    }
  ]
}
```

---

### 4. Add Physical Stock (`POST /add-stock`)

Increments a variant's available quantity and appends an immutable `STOCK_ADDED` transaction ledger record.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/add-stock`
- **Access**: Admin (`inventory:update` or `SUPER_ADMIN`)

#### Request Body
```json
{
  "variantId": "var-99999999-8888-7777-6666-555555555555",
  "quantity": 100,
  "note": "Restock shipment from Supplier Batch #842",
  "referenceType": "PURCHASE_ORDER",
  "referenceId": "PO-2026-0045"
}
```

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Stock added successfully",
  "data": {
    "inventory": {
      "id": "inv-11111111-2222-3333-4444-555555555555",
      "variantId": "var-99999999-8888-7777-6666-555555555555",
      "availableQuantity": 145,
      "reservedQuantity": 5,
      "reorderLevel": 10
    },
    "transaction": {
      "id": "tx-11111111-2222-3333-4444-555555555555",
      "type": "STOCK_ADDED",
      "quantity": 100,
      "note": "Restock shipment from Supplier Batch #842",
      "referenceType": "PURCHASE_ORDER",
      "referenceId": "PO-2026-0045",
      "createdAt": "2026-09-08T15:00:00.000Z"
    }
  }
}
```

##### Scenario 4.B: Error - Non-Positive Quantity (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Added quantity must be at least 1",
  "statusCode": 400
}
```

---

### 5. Remove Stock / Write-Off (`POST /remove-stock`)

Decrements available stock for shrinkage, warehouse damage, or write-offs with overselling validation.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/remove-stock`
- **Access**: Admin (`inventory:update` or `SUPER_ADMIN`)

#### Request Body
```json
{
  "variantId": "var-99999999-8888-7777-6666-555555555555",
  "quantity": 4,
  "note": "Water damage in aisle 4",
  "referenceType": "DAMAGE_REPORT",
  "referenceId": "DMG-2026-012"
}
```

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Stock removed successfully",
  "data": {
    "inventory": {
      "availableQuantity": 41,
      "reservedQuantity": 5
    },
    "transaction": {
      "type": "STOCK_REMOVED",
      "quantity": 4,
      "note": "Water damage in aisle 4"
    }
  }
}
```

##### Scenario 5.B: Error - Insufficient Available Stock (`400 Bad Request`)
- **Cause**: Trying to remove more units than currently available (unreserved).
```json
{
  "success": false,
  "message": "Cannot remove 50 units. Only 45 units available in stock.",
  "statusCode": 400
}
```

---

### 6. Manual Stock Count Adjustment (`POST /adjust`)

Directly synchronizes available stock after a physical count audit or updates the low-stock alert reorder threshold.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/adjust`
- **Access**: Admin (`inventory:update` or `SUPER_ADMIN`)

#### Request Body
```json
{
  "variantId": "var-99999999-8888-7777-6666-555555555555",
  "availableQuantity": 60,
  "reorderLevel": 15,
  "note": "Quarterly physical count reconciliation"
}
```

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Inventory adjusted successfully",
  "data": {
    "inventory": {
      "availableQuantity": 60,
      "reorderLevel": 15
    },
    "transaction": {
      "type": "MANUAL_ADJUSTMENT",
      "quantity": 15,
      "note": "Quarterly physical count reconciliation"
    }
  }
}
```

##### Scenario 6.B: Error - Negative Quantity (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Available quantity cannot be negative",
  "statusCode": 400
}
```

---

### 7. Query Immutable Transaction Audit Ledger (`GET /transactions`)

Retrieves paginated audit log entries of historical stock changes with rich filters.

- **Method**: `GET`
- **URL**: `/api/v1/inventory/transactions`
- **Access**: Admin (`inventory:read` or `SUPER_ADMIN`)

#### Query Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `variantId` | `UUID` | No | Filter by specific variant |
| `type` | `enum` | No | `STOCK_ADDED`, `STOCK_REMOVED`, `ORDER_RESERVED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `RETURNED`, `MANUAL_ADJUSTMENT` |
| `referenceType` | `string` | No | Filter by reference type (e.g. `PURCHASE_ORDER`, `RESERVATION`) |
| `referenceId` | `string` | No | Filter by reference ID |
| `page` | `integer` | No | Page number (Default: `1`) |
| `limit` | `integer` | No | Items per page (Default: `20`, Max: `100`) |
| `startDate` | `ISO 8601` | No | Transactions on or after timestamp |
| `endDate` | `ISO 8601` | No | Transactions on or before timestamp |

#### Scenarios

##### Scenario 7.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Inventory transactions retrieved successfully",
  "data": {
    "items": [
      {
        "id": "tx-11111111-2222-3333-4444-555555555555",
        "variantId": "var-99999999-8888-7777-6666-555555555555",
        "type": "ORDER_RESERVED",
        "quantity": 2,
        "note": "Reserved 2 units for checkout",
        "referenceType": "RESERVATION",
        "referenceId": "res-11111111-2222-3333-4444-555555555555",
        "createdAt": "2026-09-08T15:30:00.000Z",
        "variant": {
          "id": "var-99999999-8888-7777-6666-555555555555",
          "sku": "TSHIRT-BLK-M",
          "product": {
            "id": "prod-11111111-2222-3333-4444-555555555555",
            "name": "Classic Crewneck T-Shirt"
          }
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

### 8. Reserve Stock for Checkout (`POST /reservations/reserve`)

Temporarily shifts units from `availableQuantity` to `reservedQuantity` for a checkout session with an automatic TTL expiration timestamp.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/reservations/reserve`
- **Access**: Authenticated User

#### Request Body
```json
{
  "variantId": "var-99999999-8888-7777-6666-555555555555",
  "quantity": 2,
  "orderId": "ord-22222222-3333-4444-5555-666666666666",
  "expiresInMinutes": 15
}
```

#### Scenarios

##### Scenario 8.A: Success (`201 Created`)
```json
{
  "success": true,
  "message": "Stock reserved successfully for checkout",
  "data": {
    "reservation": {
      "id": "res-11111111-2222-3333-4444-555555555555",
      "variantId": "var-99999999-8888-7777-6666-555555555555",
      "quantity": 2,
      "status": "ACTIVE",
      "expiresAt": "2026-09-08T15:45:00.000Z",
      "createdAt": "2026-09-08T15:30:00.000Z"
    },
    "inventory": {
      "availableQuantity": 43,
      "reservedQuantity": 7
    },
    "transaction": {
      "type": "ORDER_RESERVED",
      "quantity": 2
    }
  }
}
```

##### Scenario 8.B: Error - Insufficient Unreserved Stock (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Insufficient stock to reserve. Requested: 10, Available: 3.",
  "statusCode": 400
}
```

---

### 9. Confirm Reservation on Payment (`POST /reservations/:id/confirm`)

Permanently commits an `ACTIVE` reservation upon payment confirmation, decrementing `reservedQuantity` and logging `ORDER_CONFIRMED`.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/reservations/:id/confirm`
- **Access**: Admin (`inventory:update` or `SUPER_ADMIN`)

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Reservation unique ID |

#### Request Body
```json
{
  "orderId": "ord-22222222-3333-4444-5555-666666666666"
}
```

#### Scenarios

##### Scenario 9.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Reservation confirmed and stock committed",
  "data": {
    "reservation": {
      "id": "res-11111111-2222-3333-4444-555555555555",
      "status": "CONFIRMED",
      "orderId": "ord-22222222-3333-4444-5555-666666666666"
    },
    "inventory": {
      "availableQuantity": 43,
      "reservedQuantity": 5
    },
    "transaction": {
      "type": "ORDER_CONFIRMED",
      "quantity": 2
    }
  }
}
```

##### Scenario 9.B: Error - Reservation Expired Before Confirmation (`400 Bad Request`)
- **Behavior**: Auto-restores stock to available pool and rejects confirmation.
```json
{
  "success": false,
  "message": "Reservation has expired and could not be confirmed. Stock has been returned to available pool.",
  "statusCode": 400
}
```

##### Scenario 9.C: Error - Reservation Already Finalized (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Cannot confirm reservation. Current status is CONFIRMED.",
  "statusCode": 400
}
```

---

### 10. Release Stock Reservation (`POST /reservations/:id/release`)

Releases held reservation stock back into the available pool upon payment cancellation or customer checkout abandonment.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/reservations/:id/release`
- **Access**: Authenticated User

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Reservation unique ID |

#### Request Body
```json
{
  "reason": "Customer cancelled payment at checkout step"
}
```

#### Scenarios

##### Scenario 10.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Reservation released and stock restored",
  "data": {
    "reservation": {
      "id": "res-11111111-2222-3333-4444-555555555555",
      "status": "RELEASED"
    },
    "inventory": {
      "availableQuantity": 45,
      "reservedQuantity": 5
    },
    "transaction": {
      "type": "ORDER_CANCELLED",
      "quantity": 2,
      "note": "Customer cancelled payment at checkout step"
    }
  }
}
```

##### Scenario 10.B: Error - Reservation Not Active (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Cannot release reservation. Current status is RELEASED.",
  "statusCode": 400
}
```

---

### 11. Cleanup Expired Stale Reservations (`POST /reservations/cleanup-expired`)

Background sweeper endpoint to identify all expired `ACTIVE` reservations, update them to `EXPIRED`, and return held quantities to available stock.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/reservations/cleanup-expired`
- **Access**: Admin (`inventory:update` or `SUPER_ADMIN`)

#### Scenarios

##### Scenario 11.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Stale reservations cleanup completed",
  "data": {
    "expiredCount": 3,
    "restoredUnits": 6,
    "timestamp": "2026-09-08T16:00:00.000Z"
  }
}
```

---

### 12. Simulate Checkout & Payment Flow (`POST /checkout/simulate`)

Testing & QA endpoint to simulate the complete lifecycle (Reserve -> Payment outcome -> Confirm / Release) in a single request.

- **Method**: `POST`
- **URL**: `/api/v1/inventory/checkout/simulate`
- **Access**: Authenticated User

#### Request Body
```json
{
  "variantId": "var-99999999-8888-7777-6666-555555555555",
  "quantity": 2,
  "simulatePaymentSuccess": true,
  "holdMinutes": 15
}
```

#### Scenarios

##### Scenario 12.A: Success - Simulated Payment Success (`200 OK`)
```json
{
  "success": true,
  "message": "Checkout simulation completed",
  "data": {
    "flowStatus": "ORDER_COMPLETED",
    "variantId": "var-99999999-8888-7777-6666-555555555555",
    "quantity": 2,
    "timeline": [
      {
        "step": 1,
        "action": "STOCK_RESERVED",
        "status": "SUCCESS",
        "message": "Successfully reserved 2 units for checkout."
      },
      {
        "step": 2,
        "action": "SIMULATED_PAYMENT",
        "status": "SUCCESS",
        "message": "Payment simulation completed successfully."
      },
      {
        "step": 3,
        "action": "RESERVATION_CONFIRMED",
        "status": "COMPLETED",
        "message": "Reservation confirmed and stock successfully committed."
      }
    ],
    "finalInventory": {
      "availableQuantity": 43,
      "reservedQuantity": 5
    }
  }
}
```

##### Scenario 12.B: Success - Simulated Payment Failure & Auto-Restoration (`200 OK`)
- **Request**: `"simulatePaymentSuccess": false`
```json
{
  "success": true,
  "message": "Checkout simulation completed",
  "data": {
    "flowStatus": "ORDER_CANCELLED_RESTORED",
    "variantId": "var-99999999-8888-7777-6666-555555555555",
    "quantity": 2,
    "timeline": [
      {
        "step": 1,
        "action": "STOCK_RESERVED",
        "status": "SUCCESS",
        "message": "Successfully reserved 2 units for checkout."
      },
      {
        "step": 2,
        "action": "SIMULATED_PAYMENT",
        "status": "FAILED",
        "message": "Simulated payment failed / declined by customer."
      },
      {
        "step": 3,
        "action": "RESERVATION_RELEASED",
        "status": "RESTORED",
        "message": "Reservation released and stock restored to available pool."
      }
    ],
    "finalInventory": {
      "availableQuantity": 45,
      "reservedQuantity": 5
    }
  }
}
```

---

## Standard Response & Error Formats

### Success Response Format (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Specific error explanation",
  "statusCode": 400
}
```

| HTTP Status | Meaning | Typical Scenario |
|---|---|---|
| `200 OK` | Success | Stock adjustments, queries, release, confirm, cleanup |
| `201 Created` | Created | Stock reservation created |
| `400 Bad Request` | Bad Request | Insufficient stock, negative quantity, expired hold |
| `401 Unauthorized` | Unauthorized | Missing or expired JWT bearer token |
| `403 Forbidden` | Forbidden | Missing `inventory:read` or `inventory:update` permission |
| `404 Not Found` | Not Found | Variant or Reservation ID does not exist |
