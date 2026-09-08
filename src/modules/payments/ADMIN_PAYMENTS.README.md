# Payment & Financial Operations - Admin API Documentation

> **Base Route**: `/api/v1/payments`  
> **Route File**: [`src/modules/payments/routes/payment.route.ts`](file:///e:/e-com/server/src/modules/payments/routes/payment.route.ts)  
> **Controller**: [`src/modules/payments/controller/payment.controller.ts`](file:///e:/e-com/server/src/modules/payments/controller/payment.controller.ts)  
> **Services**: [`src/modules/payments/services/`](file:///e:/e-com/server/src/modules/payments/services/)  
> **Validations**: [`src/modules/payments/validations/payment.validation.ts`](file:///e:/e-com/server/src/modules/payments/validations/payment.validation.ts)  
> **Target Audience**: Finance Teams, Operations Administrators, Customer Support Portals & Payment Gateway Reconcilers

---

## Table of Contents

1. [Payment Lifecycle & Ledger Architecture](#payment-lifecycle--ledger-architecture)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Supported Payment Gateways](#supported-payment-gateways)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List All Platform Payments (`GET /admin/list`)](#1-list-all-platform-payments-get-adminlist)
   - [2. Inspect Payment & Attempt Ledger (`GET /:id`)](#2-inspect-payment--attempt-ledger-get-id)
   - [3. Issue Full or Partial Refund (`POST /refund`)](#3-issue-full-or-partial-refund-post-refund)
   - [4. Reconcile Payment with Gateway (`POST /reconcile`)](#4-reconcile-payment-with-gateway-post-reconcile)
6. [Gateway Webhook Diagnostics & Verification](#gateway-webhook-diagnostics--verification)
7. [Security & Error Codes Reference](#security--error-codes-reference)

---

## Payment Lifecycle & Ledger Architecture

```
                     ┌──────────────────┐
                     │     PENDING      │
                     └────────┬─────────┘
                              │
                     POST /initialize (Attempt #1)
                              │
                     ┌────────▼─────────┐
                     │    PROCESSING    │
                     └────────┬─────────┘
                              │
            ┌─────────────────┴─────────────────┐
     Webhook: SUCCESS                    Webhook: FAILED
            │                                   │
            ▼                                   ▼
    ┌───────────────┐                   ┌───────────────┐
    │    SUCCESS    │                   │    FAILED     │◀─── POST /retry
    └───────┬───────┘                   └───────────────┘   (Attempt #N)
            │
   POST /refund (Full/Partial)
            │
            ▼
    ┌───────────────┐
    │   REFUNDED /  │
    │ PARTIALLY_REF │
    └───────────────┘
```

- **Double-Entry Financial Ledger**: Every payment event (`CAPTURE`, `REFUND`, `CHARGEBACK`) writes an immutable ledger transaction with precise decimal amounts and gateway reference IDs.
- **Refund Invariants**: `refundAmount <= (payment.amount - payment.refundedAmount)`. Double-refunding or over-refunding is strictly blocked at the database level.
- **Order State Synchronization**:
  - Payment `SUCCESS` transitions linked Order to `CONFIRMED` and converts inventory reservations into committed sales.
  - Full `REFUND` transitions linked Order to `REFUNDED`.
- **Self-Healing Reconciliation**: The `/reconcile` endpoint directly queries the external gateway (Stripe API / Razorpay API) to recover from dropped or delayed webhooks.

---

## Admin Permissions & Security Matrix

All administrative payment operations require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the specific permission constants:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.PAYMENT_READ` (`payment:read`) | Read Only | List all global payments, view discrete attempt ledgers, trigger gateway reconciliation |
| `PERMISSIONS.PAYMENT_REFUND` (`payment:refund`) | Financial Mutation | Issue full or partial refunds, debit payment balance, update order refund status |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted access across all financial queries, refunds, and reconciliation endpoints |

---

## Supported Payment Gateways

| Provider | Identifier | Features Supported |
|---|---|---|
| **Stripe** | `STRIPE` | Card, Apple Pay, Google Pay, Payment Intents, Webhooks with cryptographic HMAC signatures, Automated Refunds |
| **Razorpay** | `RAZORPAY` | UPI, Netbanking, Cards, Wallets, Webhook Signature Verification, Instant Refunds |
| **Mock Gateway** | `MOCK` | Local development and automated end-to-end testing simulator |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/payments/admin/list` | `payment:read` | List all platform payments with status, provider, and order filters |
| `GET` | `/api/v1/payments/:id` | `payment:read` / User | Get comprehensive payment breakdown with attempts, ledger entries, and refunds |
| `POST` | `/api/v1/payments/refund` | `payment:refund` | Issue full or partial refund with gateway dispatch and order state update |
| `POST` | `/api/v1/payments/reconcile` | `payment:read` | Query external gateway to synchronize payment state and recover lost webhooks |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. List All Platform Payments (`GET /admin/list`)

Lists all platform payment records with pagination, provider filtering, order UUID search, and status filtering.

- **Method**: `GET`
- **URL**: `/api/v1/payments/admin/list`
- **Permission**: `payment:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page (Max: 100) |
| `status` | `enum` | No | - | `PENDING`, `PROCESSING`, `REQUIRES_ACTION`, `SUCCESS`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| `orderId` | `UUID` | No | - | Filter by target Order ID |
| `provider` | `string` | No | - | `STRIPE`, `RAZORPAY`, `MOCK` |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Payments retrieved successfully",
  "data": {
    "items": [
      {
        "id": "pay-11111111-2222-3333-4444-555555555555",
        "orderId": "ord-22222222-3333-4444-5555-666666666666",
        "status": "SUCCESS",
        "amount": 126.64,
        "refundedAmount": 0.00,
        "currency": "USD",
        "provider": "STRIPE",
        "paymentMethod": "card_visa",
        "attemptsCount": 1,
        "createdAt": "2026-09-08T12:00:00.000Z",
        "updatedAt": "2026-09-08T12:02:00.000Z"
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

##### Scenario 1.B: Error - Missing Permission (`403 Forbidden`)
```json
{
  "success": false,
  "message": "Forbidden: Required permission 'payment:read' missing",
  "statusCode": 403
}
```

---

### 2. Inspect Payment & Attempt Ledger (`GET /:id`)

Retrieves full financial specifications for a payment, including all gateway attempts, ledger transactions, and refund audit history.

- **Method**: `GET`
- **URL**: `/api/v1/payments/:id`
- **Permission**: `payment:read` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Payment unique ID |

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Payment retrieved successfully",
  "data": {
    "id": "pay-11111111-2222-3333-4444-555555555555",
    "orderId": "ord-22222222-3333-4444-5555-666666666666",
    "status": "SUCCESS",
    "amount": 126.64,
    "refundedAmount": 0.00,
    "currency": "USD",
    "provider": "STRIPE",
    "paymentMethod": "card_visa",
    "attempts": [
      {
        "id": "att-1",
        "attemptNumber": 1,
        "status": "SUCCESS",
        "gatewayTransactionId": "pi_3MtwBwLkdIwHu7ix28a3tqPa",
        "gatewayResponseCode": "200",
        "createdAt": "2026-09-08T12:00:05.000Z"
      }
    ],
    "transactions": [
      {
        "id": "txn-1",
        "type": "CAPTURE",
        "amount": 126.64,
        "currency": "USD",
        "gatewayTransactionId": "ch_3MtwBwLkdIwHu7ix28a3tqPa",
        "createdAt": "2026-09-08T12:02:00.000Z"
      }
    ],
    "refunds": []
  }
}
```

##### Scenario 2.B: Error - Payment Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Payment not found",
  "statusCode": 404
}
```

---

### 3. Issue Full or Partial Refund (`POST /refund`)

Issues a full or partial refund against a successful payment, calls the external provider's refund API, writes a ledger `REFUND` transaction, debits the refundable balance, and synchronizes the parent order's status to `REFUNDED` or `PARTIALLY_REFUNDED`.

- **Method**: `POST`
- **URL**: `/api/v1/payments/refund`
- **Permission**: `payment:refund` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `paymentId` | `UUID` | Yes | Valid payment UUID | Target payment to refund |
| `amount` | `number` | No | Min: 0.01 | Amount to refund (defaults to remaining unrefunded balance) |
| `reason` | `string` | No | 3–500 chars | Refund justification / audit note |

#### Request Body Example (Partial Refund)
```json
{
  "paymentId": "pay-11111111-2222-3333-4444-555555555555",
  "amount": 50.00,
  "reason": "Customer returned 1 damaged item"
}
```

#### Scenarios

##### Scenario 3.A: Success - Partial Refund (`200 OK`)
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refundId": "ref-11111111-2222-3333-4444-555555555555",
    "paymentId": "pay-11111111-2222-3333-4444-555555555555",
    "amount": 50.00,
    "currency": "USD",
    "status": "COMPLETED",
    "gatewayRefundId": "re_3MtwBwLkdIwHu7ix28a3tqPa",
    "remainingRefundable": 76.64,
    "paymentStatus": "PARTIALLY_REFUNDED"
  }
}
```

##### Scenario 3.B: Success - Full Refund (`200 OK`)
- **Request**: `{"paymentId": "pay-11111111-2222-3333-4444-555555555555", "reason": "Order cancelled by customer"}`
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refundId": "ref-22222222-3333-4444-5555-666666666666",
    "paymentId": "pay-11111111-2222-3333-4444-555555555555",
    "amount": 126.64,
    "currency": "USD",
    "status": "COMPLETED",
    "remainingRefundable": 0.00,
    "paymentStatus": "REFUNDED"
  }
}
```

##### Scenario 3.C: Error - Over-Refund Exceeds Available Balance (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Refund amount ($150.00) exceeds remaining refundable balance ($126.64)",
  "statusCode": 400
}
```

##### Scenario 3.D: Error - Payment Not in Succeeded State (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Cannot refund payment in \"FAILED\" status. Only SUCCESS or PARTIALLY_REFUNDED payments can be refunded.",
  "statusCode": 400
}
```

---

### 4. Reconcile Payment with Gateway (`POST /reconcile`)

Queries the gateway provider directly (e.g. Stripe PaymentIntent fetch) to heal payments stuck in `PROCESSING` due to network drops or unreceived webhooks.

- **Method**: `POST`
- **URL**: `/api/v1/payments/reconcile`
- **Permission**: `payment:read` or `SUPER_ADMIN`

#### Request Body
```json
{
  "paymentId": "pay-11111111-2222-3333-4444-555555555555"
}
```

#### Scenarios

##### Scenario 4.A: Success - Synced to Success (`200 OK`)
```json
{
  "success": true,
  "message": "Payment reconciled successfully with provider",
  "data": {
    "paymentId": "pay-11111111-2222-3333-4444-555555555555",
    "previousStatus": "PROCESSING",
    "currentStatus": "SUCCESS",
    "gatewayStatus": "succeeded",
    "reconciled": true,
    "orderUpdated": true
  }
}
```

---

## Gateway Webhook Diagnostics & Verification

The webhook consumer endpoint [`POST /api/v1/payments/webhook/:provider`](file:///e:/e-com/server/src/modules/payments/routes/payment.route.ts) automatically:
1. **Verifies Cryptographic Signatures**:
   - Stripe: `stripe-signature` header validated against endpoint secret.
   - Razorpay: `x-razorpay-signature` verified using HMAC SHA256.
2. **Enforces Idempotency**: Deduplicates duplicate webhook deliveries using payment attempt transaction IDs.
3. **Emits Outbox Events**: Creates `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` events for asynchronous dispatch to email notification workers.

---

## Security & Error Codes Reference

| HTTP Status | Reason | Typical Cause |
|---|---|---|
| `200 OK` | Success | Payment retrieved, refund issued, reconciliation completed |
| `400 Bad Request` | Financial Logic Failure | Refund exceeds balance, non-succeeded payment, invalid UUID |
| `401 Unauthorized` | Auth Required | Missing bearer token |
| `403 Forbidden` | Permission Missing | Account lacks `payment:read` or `payment:refund` permission |
| `404 Not Found` | Entity Missing | Payment UUID does not exist |
