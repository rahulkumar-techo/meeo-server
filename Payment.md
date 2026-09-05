# Advanced Payment Architecture

## 1. Payment Design Goals

The payment system must handle:

* Online payments
* Cash on Delivery
* Payment provider abstraction
* Payment retries
* Payment webhooks
* Duplicate webhook delivery
* Payment verification
* Refunds
* Partial refunds
* Payment failures
* Idempotency
* Transaction history
* Auditability
* Reliable event publishing

The most important principle is:

> Never trust the client to confirm a payment. Payment status must be confirmed by the payment provider through verification or a signed webhook.

---

# 2. Payment Architecture

```text
                    CLIENT
                       │
                       ▼
                 CHECKOUT API
                       │
                       ▼
                CREATE ORDER
                       │
                       ▼
              CREATE PAYMENT RECORD
                       │
                       ▼
              PAYMENT PROVIDER API
                       │
                       ▼
                 CLIENT PAYMENT
                       │
                       ▼
               PAYMENT PROVIDER
                       │
                       ▼
              PAYMENT WEBHOOK
                       │
                       ▼
                 API SERVER
                       │
                       ▼
             VERIFY WEBHOOK SIGNATURE
                       │
                       ▼
              PAYMENT PROCESSING
                       │
                       ▼
                 PostgreSQL
                       │
                       ▼
                 OUTBOX EVENT
                       │
                       ▼
                    REDIS
                       │
                       ▼
                 JOB WORKERS
```

---

# 3. Payment Provider Abstraction

Do not connect the Order module directly to a specific payment provider.

Use an abstraction layer.

```text
PaymentService
      │
      ▼
PaymentProvider Interface
      │
      ├──────────── Provider A
      │
      ├──────────── Provider B
      │
      ├──────────── Provider C
      │
      └──────────── Cash On Delivery
```

Example provider interface:

```typescript
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;

  verifyPayment(
    providerPaymentId: string
  ): Promise<PaymentVerificationResult>;

  refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundResult>;
}
```

The Order module should communicate only with the Payment module.

```text
Order Module
     │
     ▼
Payment Service
     │
     ▼
Payment Provider
```

---

# 4. Payment Database Design

The payment domain should use multiple tables.

```text
payments
    │
    ├── payment_attempts
    │
    ├── payment_transactions
    │
    ├── payment_webhooks
    │
    └── refunds
```

This separation is important.

A payment is the business entity.

A payment attempt represents one attempt to pay.

A transaction represents a financial provider operation.

---

# 5. Payments Table

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY,

    order_id UUID NOT NULL,

    provider VARCHAR(100) NOT NULL,

    payment_method VARCHAR(100),

    status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    currency CHAR(3)
        NOT NULL,

    amount NUMERIC(12, 2)
        NOT NULL,

    paid_amount NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    refunded_amount NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    provider_customer_id VARCHAR(255),

    metadata JSONB,

    expires_at TIMESTAMP,

    paid_at TIMESTAMP,

    failed_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
);
```

---

# 6. Payment Status Lifecycle

Recommended statuses:

```text
PENDING
PROCESSING
REQUIRES_ACTION
SUCCESS
FAILED
CANCELLED
PARTIALLY_REFUNDED
REFUNDED
```

Lifecycle:

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├──────────────► REQUIRES_ACTION
   │                     │
   │                     ▼
   │                  PROCESSING
   │
   ├──────────────► SUCCESS
   │
   ├──────────────► FAILED
   │
   └──────────────► CANCELLED
```

Refund lifecycle:

```text
SUCCESS
   │
   ├────────────► PARTIALLY_REFUNDED
   │
   └────────────► REFUNDED
```

---

# 7. Payment Attempts

A customer may attempt to pay multiple times for the same order.

Example:

```text
Order: ORD_001

Attempt 1
Card Declined

Attempt 2
Network Timeout

Attempt 3
Payment Success
```

Do not overwrite the original payment attempt.

Store each attempt.

```sql
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,

    payment_id UUID NOT NULL,

    attempt_number INTEGER NOT NULL,

    provider_payment_id VARCHAR(255),

    status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    amount NUMERIC(12, 2)
        NOT NULL,

    failure_code VARCHAR(100),

    failure_message TEXT,

    initiated_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMP,

    FOREIGN KEY (payment_id)
        REFERENCES payments(id)
);
```

Recommended constraint:

```sql
CREATE UNIQUE INDEX idx_payment_attempt_number
ON payment_attempts(payment_id, attempt_number);
```

---

# 8. Payment Transactions

A payment can generate multiple financial operations.

Example:

```text
Payment

├── AUTHORIZE
│
├── CAPTURE
│
└── REFUND
```

Database:

```sql
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,

    payment_id UUID NOT NULL,

    payment_attempt_id UUID,

    type VARCHAR(50)
        NOT NULL,

    status VARCHAR(50)
        NOT NULL,

    amount NUMERIC(12, 2)
        NOT NULL,

    currency CHAR(3)
        NOT NULL,

    provider_transaction_id VARCHAR(255),

    provider_response JSONB,

    idempotency_key VARCHAR(255),

    failure_code VARCHAR(100),

    failure_message TEXT,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    FOREIGN KEY (payment_id)
        REFERENCES payments(id),

    FOREIGN KEY (payment_attempt_id)
        REFERENCES payment_attempts(id)
);
```

Transaction types:

```text
AUTHORIZE
CAPTURE
CHARGE
VOID
REFUND
REVERSAL
```

Transaction status:

```text
PENDING
PROCESSING
SUCCESS
FAILED
```

---

# 9. Payment Webhooks

Webhooks are critical for reliable payment processing.

A provider may send:

```text
PAYMENT_SUCCESS
PAYMENT_FAILED
PAYMENT_REFUNDED
PAYMENT_CANCELLED
```

The webhook endpoint should not immediately perform heavy processing.

Flow:

```text
PAYMENT PROVIDER
       │
       ▼
WEBHOOK API
       │
       ▼
VERIFY SIGNATURE
       │
       ▼
STORE WEBHOOK
       │
       ▼
DATABASE TRANSACTION
       │
       ├── Update Payment
       │
       ├── Create Payment Transaction
       │
       └── Create Outbox Event
       │
       ▼
COMMIT
       │
       ▼
RETURN HTTP 200
```

---

# 10. Payment Webhooks Table

```sql
CREATE TABLE payment_webhooks (
    id UUID PRIMARY KEY,

    provider VARCHAR(100)
        NOT NULL,

    provider_event_id VARCHAR(255)
        NOT NULL,

    event_type VARCHAR(150)
        NOT NULL,

    payload JSONB
        NOT NULL,

    signature_verified BOOLEAN
        NOT NULL DEFAULT FALSE,

    processing_status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    error_message TEXT,

    received_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    processed_at TIMESTAMP,

    UNIQUE(provider, provider_event_id)
);
```

The unique constraint is essential:

```text
UNIQUE(provider, provider_event_id)
```

Why?

Payment providers can resend the same webhook.

Example:

```text
Webhook Received
      │
      ▼
Payment Updated
      │
API Response Lost
      │
Provider Sends Webhook Again
```

The database must prevent duplicate processing.

---

# 11. Payment Webhook Processing

```text
WEBHOOK RECEIVED
        │
        ▼
VERIFY PROVIDER SIGNATURE
        │
        ├──────────── Invalid
        │                  │
        │                  ▼
        │              REJECT 401
        │
        ▼
CHECK PROVIDER EVENT ID
        │
        ├──────────── Exists
        │                  │
        │                  ▼
        │              RETURN 200
        │
        ▼
STORE WEBHOOK
        │
        ▼
PROCESS PAYMENT
        │
        ├── Update Payment
        │
        ├── Create Transaction
        │
        ├── Update Order
        │
        └── Create Outbox Event
        │
        ▼
COMMIT
```

---

# 12. Idempotency Keys

Idempotency is mandatory for payment operations.

Example problem:

```text
Client
   │
POST /checkout
   │
Network Timeout
   │
Client Retries
   │
POST /checkout
```

Without idempotency:

```text
Two Orders ❌
Two Payment Charges ❌
```

Use:

```text
Idempotency-Key
```

Example:

```text
Idempotency-Key: checkout_01HV123
```

Store it:

```sql
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY,

    key VARCHAR(255)
        UNIQUE NOT NULL,

    user_id UUID,

    request_hash VARCHAR(255),

    status VARCHAR(30)
        NOT NULL DEFAULT 'PROCESSING',

    response_status INTEGER,

    response_body JSONB,

    expires_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

Flow:

```text
REQUEST
   │
   ▼
IDEMPOTENCY KEY EXISTS?
   │
   ├──── YES ───► Return Previous Response
   │
   └──── NO
           │
           ▼
      Create Operation
           │
           ▼
       Save Response
```

---

# 13. Payment Success Flow

This is the recommended complete flow.

```text
1. Client Starts Checkout
        │
        ▼
2. Validate Cart
        │
        ▼
3. Calculate Final Price
        │
        ▼
4. Start Database Transaction
        │
        ├── Create Order
        │
        ├── Create Order Items
        │
        ├── Reserve Inventory
        │
        ├── Create Payment
        │
        └── Create Outbox Event
        │
        ▼
5. Commit Transaction
        │
        ▼
6. Create Provider Payment
        │
        ▼
7. Client Completes Payment
        │
        ▼
8. Provider Sends Webhook
        │
        ▼
9. Verify Webhook
        │
        ▼
10. Start Database Transaction
        │
        ├── Update Payment = SUCCESS
        │
        ├── Create Payment Transaction
        │
        ├── Update Order = CONFIRMED
        │
        ├── Confirm Inventory Reservation
        │
        └── Create PAYMENT_SUCCESS Event
        │
        ▼
11. Commit
        │
        ▼
12. Outbox Publisher
        │
        ▼
13. Redis Queue
        │
        ▼
14. Worker Server
        │
        ├── Send Receipt
        ├── Send Notification
        ├── Start Fulfillment
        └── Analytics
```

---

# 14. Payment Failure Flow

```text
Payment Provider
      │
      ▼
Payment Failed
      │
      ▼
Webhook Received
      │
      ▼
Verify Signature
      │
      ▼
Start Database Transaction
      │
      ├── Payment = FAILED
      │
      ├── Create Failed Transaction
      │
      ├── Update Payment Attempt
      │
      └── Create PAYMENT_FAILED Event
      │
      ▼
Commit
      │
      ▼
Customer Can Retry
```

Important:

> Do not immediately cancel an order after one payment attempt fails.

The customer may use another card or payment method.

---

# 15. Payment Expiration

Orders waiting for payment should expire.

Example:

```text
ORDER CREATED
      │
      ▼
PAYMENT_PENDING
      │
      ▼
30 MINUTES
      │
      ▼
PAYMENT NOT COMPLETED
      │
      ▼
ORDER EXPIRED
      │
      ▼
RELEASE INVENTORY
```

Use a delayed BullMQ job or scheduled worker.

```text
Create Order
      │
      ▼
Schedule Payment Expiration Job
      │
      ▼
Wait 30 Minutes
      │
      ▼
Check Payment Status
      │
   ┌──┴────────────┐
   │               │
SUCCESS         NOT PAID
   │               │
STOP         Expire Order
                  │
                  ▼
          Release Inventory
```

---

# 16. Refund Architecture

Refunds should be separate entities.

```text
Payment
   │
   ├── Refund 1
   │
   ├── Refund 2
   │
   └── Refund 3
```

Database:

```sql
CREATE TABLE refunds (
    id UUID PRIMARY KEY,

    payment_id UUID NOT NULL,

    amount NUMERIC(12, 2)
        NOT NULL,

    currency CHAR(3)
        NOT NULL,

    reason TEXT,

    status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    provider_refund_id VARCHAR(255),

    requested_by UUID,

    requested_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMP,

    FOREIGN KEY (payment_id)
        REFERENCES payments(id),

    FOREIGN KEY (requested_by)
        REFERENCES users(id)
);
```

Refund status:

```text
PENDING
PROCESSING
SUCCESS
FAILED
CANCELLED
```

---

# 17. Partial Refund Validation

Before creating a refund:

```text
Total Paid
      │
      ▼
$100
      │
      ▼
Already Refunded
      │
      ▼
$30
      │
      ▼
Maximum Refundable
      │
      ▼
$70
```

The system must prevent:

```text
Paid: $100

Refund 1: $70
Refund 2: $50

Total: $120 ❌
```

Use a database transaction and locking when calculating refundable amounts.

---

# 18. Payment State Ownership

This is a critical architecture rule.

```text
Client
   │
   └── Can REQUEST payment

Payment Provider
   │
   └── Confirms payment result

Backend
   │
   └── Owns database payment status
```

The client should never directly set:

```text
payment.status = SUCCESS
```

Only verified provider responses should result in:

```text
PENDING → SUCCESS
```

---

# 19. Payment Event Architecture

Payment events should include:

```text
PAYMENT_CREATED
PAYMENT_PROCESSING
PAYMENT_SUCCESS
PAYMENT_FAILED
PAYMENT_CANCELLED

REFUND_REQUESTED
REFUND_SUCCESS
REFUND_FAILED
```

Example event:

```json
{
  "eventId": "evt_01",
  "eventType": "PAYMENT_SUCCESS",
  "paymentId": "pay_01",
  "orderId": "ord_01",
  "amount": 100.00,
  "currency": "USD",
  "occurredAt": "2026-09-02T10:00:00Z"
}
```

---

# 20. Payment and Outbox Integration

When payment status changes, the business change and event must be stored in the same transaction.

```text
BEGIN TRANSACTION

    Update Payment
          │
          ▼
    Create Payment Transaction
          │
          ▼
    Update Order
          │
          ▼
    Confirm Inventory
          │
          ▼
    Create Outbox Event

COMMIT
```

Example:

```text
Payment SUCCESS

        +
Order CONFIRMED

        +
Inventory CONFIRMED

        +
PAYMENT_SUCCESS Event
```

All are committed atomically.

---

# 21. Payment Database Relationship

```text
                    ORDERS
                       │
                       ▼
                   PAYMENTS
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   PAYMENT         PAYMENT         REFUNDS
   ATTEMPTS       TRANSACTIONS
        │
        ▼
   Provider Payment


PAYMENT PROVIDER
       │
       ▼
 PAYMENT WEBHOOKS
       │
       ▼
PAYMENT PROCESSING
       │
       ▼
 OUTBOX EVENTS
       │
       ▼
    REDIS QUEUE
       │
       ▼
   JOB WORKERS
```

---

# 22. Recommended Payment Indexes

```sql
CREATE INDEX idx_payments_order_id
ON payments(order_id);

CREATE INDEX idx_payments_status
ON payments(status);

CREATE INDEX idx_payment_attempts_payment_id
ON payment_attempts(payment_id);

CREATE INDEX idx_payment_transactions_payment_id
ON payment_transactions(payment_id);

CREATE UNIQUE INDEX idx_payment_webhooks_provider_event
ON payment_webhooks(provider, provider_event_id);

CREATE INDEX idx_refunds_payment_id
ON refunds(payment_id);
```

---

# 23. Final Payment Reliability Model

The payment system relies on five protections:

```text
1. Idempotency Key
        │
        ▼
Prevent duplicate client requests

2. Provider Idempotency
        │
        ▼
Prevent duplicate charges

3. Webhook Unique Event ID
        │
        ▼
Prevent duplicate webhook processing

4. Database Transaction
        │
        ▼
Keep Payment + Order consistent

5. Transactional Outbox
        │
        ▼
Guarantee downstream events
```

---

# 24. Recommended Payment Architecture

```text
CLIENT
   │
   ▼
CHECKOUT API
   │
   ▼
IDEMPOTENCY CHECK
   │
   ▼
CREATE ORDER
   │
   ▼
RESERVE INVENTORY
   │
   ▼
CREATE PAYMENT
   │
   ▼
PAYMENT PROVIDER
   │
   ▼
CLIENT COMPLETES PAYMENT
   │
   ▼
PROVIDER WEBHOOK
   │
   ▼
VERIFY SIGNATURE
   │
   ▼
DATABASE TRANSACTION
   │
   ├── PAYMENT SUCCESS
   ├── PAYMENT TRANSACTION
   ├── ORDER CONFIRMED
   ├── INVENTORY CONFIRMED
   └── OUTBOX EVENT
   │
   ▼
COMMIT
   │
   ▼
OUTBOX PUBLISHER
   │
   ▼
REDIS / BULLMQ
   │
   ▼
WORKER SERVER
   │
   ├── EMAIL RECEIPT
   ├── PUSH NOTIFICATION
   ├── FULFILLMENT
   └── ANALYTICS
```

---

# 25. Final Recommendation

For an advanced e-commerce backend, the payment module should be treated as an independent domain inside the modular monolith.

The recommended structure is:

```text
modules/
└── payments/
    │
    ├── domain/
    │   ├── payment.entity.ts
    │   ├── payment-status.ts
    │   └── payment-provider.interface.ts
    │
    ├── application/
    │   ├── create-payment.ts
    │   ├── verify-payment.ts
    │   ├── process-webhook.ts
    │   └── refund-payment.ts
    │
    ├── infrastructure/
    │   ├── providers/
    │   ├── repositories/
    │   └── webhook/
    │
    └── presentation/
        ├── payment.routes.ts
        └── payment.schemas.ts
```

The most important rule is:

> Payment completion must be driven by verified provider information, payment operations must be idempotent, and every confirmed payment state change must atomically create its corresponding outbox event.
