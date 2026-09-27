# Payments Module API & Integration Documentation

> **Base Route**: `/api/v1/payments`  
> **Route Definition**: [`src/modules/payments/routes/payment.route.ts`](file:///e:/e-com/server/src/modules/payments/routes/payment.route.ts)  
> **Controllers**: [`src/modules/payments/controller/payment.controller.ts`](file:///e:/e-com/server/src/modules/payments/controller/payment.controller.ts)  
> **Services**: [`src/modules/payments/services/payment.service.ts`](file:///e:/e-com/server/src/modules/payments/services/payment.service.ts), [`src/modules/payments/services/paymentVerification.service.ts`](file:///e:/e-com/server/src/modules/payments/services/paymentVerification.service.ts)  
> **Validation Schemas**: [`src/modules/payments/validations/payment.validation.ts`](file:///e:/e-com/server/src/modules/payments/validations/payment.validation.ts)  
> **Admin Guide**: [`ADMIN_PAYMENTS.README.md`](file:///e:/e-com/server/src/modules/payments/ADMIN_PAYMENTS.README.md)

---

## Table of Contents

1. [Architecture & Design Principles](#architecture--design-principles)
2. [Supported Payment Gateway](#supported-payment-gateway)
3. [Lifecycle & State Machine](#lifecycle--state-machine)
4. [Endpoints Summary](#endpoints-summary)
5. [Endpoint Specifications & Payload Contracts](#endpoint-specifications--payload-contracts)
   - [1. Initialize Payment Intent (`POST /initialize`)](#1-initialize-payment-intent-post-initialize)
   - [2. Verify Payment Signature (`POST /verify`)](#2-verify-payment-signature-post-verify)
   - [3. Record Payment Failure / Cancel (`POST /fail`)](#3-record-payment-failure-cancel-post-fail)
   - [4. Retry Failed Payment (`POST /retry`)](#4-retry-failed-payment-post-retry)
   - [5. Get Payment Details & Attempt Ledger (`GET /:id`)](#5-get-payment-details--attempt-ledger-get-id)
   - [6. Process Refund (`POST /refund`)](#6-process-refund-post-refund)
   - [7. Reconcile Payment (`POST /reconcile`)](#7-reconcile-payment-post-reconcile)
   - [8. List Payments (`GET /admin/list`)](#8-list-payments-get-adminlist)
6. [Frontend Client SDK Integration Guide (React / Next.js)](#frontend-client-sdk-integration-guide-react--nextjs)
7. [Automated Outbox & Notification Flow](#automated-outbox--notification-flow)
8. [Error Handling & Status Codes](#error-handling--status-codes)

---

## Architecture & Design Principles

The Payments module is dedicated to **Razorpay** and provides clean, robust, and idempotent payment handling:

- **Single Source of Truth**: Unified verification endpoint (`POST /verify`) validates Razorpay's cryptographic HMAC SHA-256 signature and executes atomic order confirmation.
- **Atomic Transactional Consistency**: When payment succeeds:
  - `Payment.status` transitions to `SUCCESS`.
  - `Order.status` transitions to `CONFIRMED`.
  - Reserved inventory converts from temporary hold to committed stock.
  - An `ORDER_PAID` event is written to the **Transactional Outbox**.
- **Double-Entry Ledger & Discrete Attempts**: Every checkout tracks discrete attempts (`PaymentAttempt`) and immutable financial ledger records (`PaymentTransaction`).
- **Zero-Manual Background Relay**: The automated background worker periodically claims pending `OutboxEvent` records, adds them to BullMQ (`domain-events`), and triggers automated customer emails, in-app notifications, and push alerts.

---

## Supported Payment Gateway

| Gateway | Identifier | Supported Methods | Features |
|---|---|---|---|
| **Razorpay** | `RAZORPAY` | UPI (GPay, PhonePe, Paytm), Netbanking, Credit/Debit Cards, Wallets | Order generation, HMAC-SHA256 signature verification, instant refunds |

---

## Lifecycle & State Machine

```
              ┌────────────────────────┐
              │     PENDING / INIT     │
              └───────────┬────────────┘
                          │
              ┌───────────▼────────────┐
              │    REQUIRES_ACTION     │ (Razorpay Checkout Modal Open)
              └─────┬────────────┬─────┘
                    │            │
      [Payment Verified]   [User Cancels / Bank Fails]
                    │            │
                    ▼            ▼
       ┌─────────────────┐  ┌───────────┐
       │     SUCCESS     │  │  FAILED   │ ──► [POST /retry] ──► New Attempt
       └────────┬────────┘  └───────────┘
                │
         [POST /refund]
                │
                ▼
       ┌────────────────────────┐
       │   REFUNDED / PARTIAL   │
       └────────────────────────┘
```

---

## Endpoints Summary

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/payments/initialize` | User Bearer | Generates a Razorpay Order and returns checkout metadata. |
| `POST` | `/api/v1/payments/verify` | User Bearer | Cryptographically verifies Razorpay payment signature and confirms order. |
| `POST` | `/api/v1/payments/fail` | User Bearer | Records payment failure or modal dismissal. |
| `POST` | `/api/v1/payments/retry` | User Bearer | Creates a new attempt for a previously failed payment. |
| `GET` | `/api/v1/payments/:id` | User / Admin | Retrieves payment breakdown, attempts, and ledger records. |
| `POST` | `/api/v1/payments/refund` | Admin (`payment:refund`) | Issues a full or partial refund via Razorpay. |
| `POST` | `/api/v1/payments/reconcile` | Admin (`payment:read`) | Reconciles payment state with Razorpay API. |
| `GET` | `/api/v1/payments/admin/list` | Admin (`payment:read`) | Lists platform payments with status filters & pagination. |

---

## Endpoint Specifications & Payload Contracts

### 1. Initialize Payment Intent (`POST /initialize`)
Initializes a payment session for an order in `PENDING` status.

**Request Body**:
```json
{
  "orderId": "b11a4180-65aa-42ec-a945-5fd21dec0538",
  "paymentMethod": "UPI"
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "paymentId": "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
    "orderId": "b11a4180-65aa-42ec-a945-5fd21dec0538",
    "orderNumber": "ORD-20260906-0001",
    "provider": "RAZORPAY",
    "providerPaymentId": "order_EKfUsjf8ubngaf",
    "clientSecret": "rzp_test_YourKeyId",
    "checkoutUrl": "https://api.razorpay.com/v1/checkout/order_EKfUsjf8ubngaf",
    "amount": 1499.00,
    "currency": "INR",
    "status": "REQUIRES_ACTION",
    "attemptNumber": 1
  }
}
```

---

### 2. Verify Payment Signature (`POST /verify`)
Directly verifies the Razorpay signature returned by the client SDK modal.

**Request Body**:
```json
{
  "orderId": "b11a4180-65aa-42ec-a945-5fd21dec0538",
  "razorpayOrderId": "order_EKfUsjf8ubngaf",
  "razorpayPaymentId": "pay_29QQoUBcxrhErF",
  "razorpaySignature": "9ef4d60bfdca8b113dc2935dd4c366d3821a772d16c47d129e5099a4aa7f0eef"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "verified": true,
    "paymentId": "c1111111-95e3-4d22-b5e1-0bfab4b901a1",
    "orderId": "b11a4180-65aa-42ec-a945-5fd21dec0538",
    "status": "SUCCESS",
    "message": "Payment verified and order confirmed successfully"
  }
}
```

---

### 3. Record Payment Failure / Cancel (`POST /fail`)
Called by frontend if user closes the modal or payment fails.

**Request Body**:
```json
{
  "orderId": "b11a4180-65aa-42ec-a945-5fd21dec0538",
  "failureCode": "BAD_REQUEST_ERROR",
  "failureMessage": "Payment failed by bank"
}
```

---

## Frontend Client SDK Integration Guide (React / Next.js)

```tsx
import { useEffect } from "react";

// 1. Load Razorpay Checkout Script
export function useRazorpay() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);
}

// 2. Checkout Flow
async function handleCheckout(orderId: string) {
  // Step A: Initialize Payment on Server
  const initRes = await fetch("/api/v1/payments/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId }),
  });
  const { data } = await initRes.json();

  // Step B: Open Razorpay Modal
  const options = {
    key: data.clientSecret, // Razorpay Key ID
    amount: data.amount * 100, // In paise
    currency: data.currency,
    name: "My E-Commerce Store",
    order_id: data.providerPaymentId, // Razorpay order_id
    handler: async function (response: any) {
      // Step C: Verify on Server
      const verifyRes = await fetch("/api/v1/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.success) {
        window.location.href = `/orders/${orderId}/success`;
      }
    },
    modal: {
      ondismiss: async function () {
        await fetch("/api/v1/payments/fail", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId, failureMessage: "Modal dismissed by user" }),
        });
      },
    },
  };

  const rzp = new (window as any).Razorpay(options);
  rzp.open();
}
```

---

## Automated Outbox & Notification Flow

When `POST /verify` completes:
1. `OutboxEvent` with `ORDER_PAID` is inserted atomically in PostgreSQL.
2. Background Poller Worker sweeps pending events every 5 seconds.
3. BullMQ Worker triggers [NotificationConsumer](file:///e:/e-com/server/src/modules/outbox/handlers/consumers/notificationConsumer.ts).
4. Automated Confirmation Email, In-App Notification bell record, and Push Notification are sent automatically.
