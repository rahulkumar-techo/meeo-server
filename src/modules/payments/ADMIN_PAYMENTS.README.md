# Payment & Financial Operations - Admin API Documentation

> **Base Route**: `/api/v1/payments`  
> **Route File**: [`src/modules/payments/routes/payment.route.ts`](file:///e:/e-com/server/src/modules/payments/routes/payment.route.ts)  
> **Controller**: [`src/modules/payments/controller/payment.controller.ts`](file:///e:/e-com/server/src/modules/payments/controller/payment.controller.ts)  
> **Services**: [`src/modules/payments/services/`](file:///e:/e-com/server/src/modules/payments/services/)  
> **Validations**: [`src/modules/payments/validations/payment.validation.ts`](file:///e:/e-com/server/src/modules/payments/validations/payment.validation.ts)  
> **Target Audience**: Finance Teams, Operations Administrators, Customer Support Portals & Payment Reconcilers

---

## Table of Contents

1. [Payment Lifecycle & Ledger Architecture](#payment-lifecycle--ledger-architecture)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Admin Endpoints Summary](#admin-endpoints-summary)
4. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List All Platform Payments (`GET /admin/list`)](#1-list-all-platform-payments-get-adminlist)
   - [2. Inspect Payment & Attempt Ledger (`GET /:id`)](#2-inspect-payment--attempt-ledger-get-id)
   - [3. Issue Full or Partial Refund (`POST /refund`)](#3-issue-full-or-partial-refund-post-refund)
   - [4. Reconcile Payment with Razorpay (`POST /reconcile`)](#4-reconcile-payment-with-razorpay-post-reconcile)
5. [Automated Outbox Relay & Notifications](#automated-outbox-relay--notifications)
6. [Security & Error Codes Reference](#security--error-codes-reference)

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
                     │ REQUIRES_ACTION  │ (Razorpay modal open)
                     └────────┬─────────┘
                              │
            ┌─────────────────┴─────────────────┐
     POST /verify: SUCCESS               POST /fail: FAILED
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

- **Double-Entry Financial Ledger**: Every payment event writes an immutable `PaymentTransaction` record with signed amounts.
- **Refund Invariants**: `refundAmount <= (payment.amount - payment.refundedAmount)`. Over-refunding is strictly blocked.
- **Order State Synchronization**: Success triggers `Order.status -> CONFIRMED`, inventory hold conversion, and `ORDER_PAID` outbox event creation.

---

## Admin Permissions & Security Matrix

| Action | Required Permission | Allowed Roles |
|---|---|---|
| View Payment Details & Ledger | `payment:read` | `SUPER_ADMIN`, `STORE_OWNER`, `FINANCE_ADMIN`, `SUPPORT_AGENT` |
| List Platform Payments | `payment:read` | `SUPER_ADMIN`, `STORE_OWNER`, `FINANCE_ADMIN` |
| Issue Full / Partial Refund | `payment:refund` | `SUPER_ADMIN`, `STORE_OWNER`, `FINANCE_ADMIN` |
| Reconcile Payment Status | `payment:read` | `SUPER_ADMIN`, `STORE_OWNER`, `FINANCE_ADMIN` |

---

## Admin Endpoints Summary

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/payments/admin/list` | `payment:read` | Paginated platform payments query with status & date filters. |
| `GET` | `/api/v1/payments/:id` | `payment:read` | Detailed payment inspection including attempts and ledger history. |
| `POST` | `/api/v1/payments/refund` | `payment:refund` | Dispatches Razorpay refund API and updates financial ledger. |
| `POST` | `/api/v1/payments/reconcile` | `payment:read` | Queries Razorpay to synchronize local state. |

---

## Automated Outbox Relay & Notifications

Whenever payment verification completes:
1. `ORDER_PAID` event is written into the `OutboxEvent` table atomically with order and inventory updates.
2. The background worker sweeps `OutboxEvent` (`status = PENDING`) every 5 seconds.
3. BullMQ domain event queue processes the job via `NotificationConsumer`.
4. Automated Confirmation Email, In-App Notification record, and Push Alerts are sent with zero manual triggers.
