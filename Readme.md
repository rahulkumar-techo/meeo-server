# Advanced E-Commerce Backend Architecture

## Overview

This document defines the architecture and technical foundation for a scalable, reliable, and maintainable e-commerce backend.

The system uses an **Advanced Modular Monolith Architecture** with two independently deployable applications:

* **API Server** — Handles client requests and synchronous business operations.
* **Worker Server** — Handles asynchronous jobs and background processing.

Both applications share the same codebase and core business modules but run as separate processes or servers.

---

# 1. Architecture Goals

The backend is designed to provide:

* Modular architecture
* High reliability
* Horizontal scalability
* Background job processing
* Event-driven communication
* Transaction safety
* Retry mechanisms
* Failure recovery
* Idempotent processing
* Secure authentication
* API rate limiting
* Database consistency
* Future migration path to microservices

The system should avoid premature microservice complexity while maintaining clear boundaries between business domains.

---

# 2. Technology Stack

## Backend

* Node.js
* TypeScript
* Fastify

## Database

* PostgreSQL
* Prisma ORM

## Cache and Queue

* Redis
* BullMQ

## Validation

* Zod
* Fastify Type Provider for Zod

## Authentication

* JWT
* Refresh Tokens
* Argon2 Password Hashing

## Security

* Helmet
* CORS
* Rate Limiting
* Input Validation

## Documentation

* Swagger
* OpenAPI

## Logging

* Pino

## Testing

* Vitest

---

# 3. High-Level Architecture

```text
                         CLIENT APPLICATION
                                │
                                ▼
                        ┌───────────────┐
                        │   API SERVER  │
                        │               │
                        │    Fastify    │
                        └───────┬───────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       PostgreSQL             Redis           Object Storage
             │                  │
             │                  │
             ▼                  ▼
       Outbox Events        BullMQ Queue
                                │
                                ▼
                        ┌───────────────┐
                        │ WORKER SERVER │
                        │               │
                        │ Background    │
                        │ Processing    │
                        └───────────────┘
```

---

# 4. Modular Monolith Architecture

The application is deployed as a monolith but internally organized into independent business modules.

```text
backend/
│
├── apps/
│   │
│   ├── api/
│   │   └── main.ts
│   │
│   └── worker/
│       └── main.ts
│
├── modules/
│   │
│   ├── auth/
│   ├── users/
│   ├── products/
│   ├── categories/
│   ├── brands/
│   ├── inventory/
│   ├── cart/
│   ├── wishlist/
│   ├── checkout/
│   ├── orders/
│   ├── payments/
│   ├── coupons/
│   ├── addresses/
│   ├── reviews/
│   ├── notifications/
│   ├── search/
│   ├── analytics/
│   └── admin/
│
├── infrastructure/
│   │
│   ├── database/
│   ├── redis/
│   ├── queue/
│   ├── events/
│   ├── storage/
│   └── logging/
│
├── common/
│   │
│   ├── errors/
│   ├── middleware/
│   ├── types/
│   ├── utils/
│   └── constants/
│
├── prisma/
│   └── schema.prisma
│
└── tests/
```

---

# 5. Core E-Commerce Modules

## Authentication

Responsibilities:

* User registration
* Login
* Logout
* JWT authentication
* Refresh token rotation
* Password reset
* Email verification
* Device/session management
* Role-based access control

---

## Users

Responsibilities:

* User profile
* Account settings
* Multiple addresses
* Notification preferences
* Account status
* Account deletion

---

## Products

Responsibilities:

* Product creation
* Product updates
* Product images
* Product variants
* SKU management
* Product attributes
* Product pricing
* Product status
* Product visibility

---

## Categories

Supports hierarchical categories.

```text
Electronics
│
├── Smartphones
│   ├── Android
│   └── iOS
│
├── Laptops
│
└── Accessories
```

---

## Inventory

Inventory is maintained independently from product information.

Responsibilities:

* Stock management
* Stock adjustments
* Stock reservations
* Stock releases
* Inventory history
* Low-stock alerts

Example flow:

```text
Checkout Started
      │
      ▼
Reserve Inventory
      │
      ▼
Payment Successful
      │
      ▼
Confirm Reservation
      │
      ▼
Reduce Available Stock
```

If payment fails:

```text
Release Reservation
      │
      ▼
Stock Available Again
```

---

## Cart

Responsibilities:

* Add item
* Remove item
* Update quantity
* Guest cart
* User cart
* Cart merging after login
* Stock validation
* Price recalculation

---

## Wishlist

Responsibilities:

* Add product
* Remove product
* Move product to cart
* Wishlist management

---

## Checkout

The checkout module orchestrates multiple business operations.

```text
Cart
 │
 ▼
Validate Products
 │
 ▼
Validate Inventory
 │
 ▼
Apply Coupon
 │
 ▼
Calculate Price
 │
 ▼
Create Order
 │
 ▼
Reserve Inventory
 │
 ▼
Create Payment
```

---

## Orders

Responsibilities:

* Order creation
* Order items
* Address snapshot
* Price snapshot
* Order status
* Order status history
* Cancellation
* Refunds
* Returns

Example lifecycle:

```text
PENDING
   │
   ▼
PAYMENT_PENDING
   │
   ▼
CONFIRMED
   │
   ▼
PROCESSING
   │
   ▼
SHIPPED
   │
   ▼
DELIVERED
```

Alternative states:

```text
CANCELLED
PAYMENT_FAILED
REFUNDED
RETURNED
```

---

## Payments

The payment system should use provider abstraction.

```text
PaymentProvider
       │
       ├── Provider A
       ├── Provider B
       └── Cash On Delivery
```

Payment states:

```text
PENDING
PROCESSING
SUCCESS
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

---

## Coupons

Supports:

* Percentage discounts
* Fixed discounts
* Free shipping
* Minimum order value
* Maximum discount
* User usage limits
* Global usage limits
* Product restrictions
* Category restrictions
* Expiration dates

---

## Reviews

Responsibilities:

* Product ratings
* Written reviews
* Review images
* Verified purchase validation
* Moderation
* Review replies

---

## Notifications

Notification channels:

* Email
* Push notifications
* SMS
* In-app notifications

Notification events:

```text
ORDER_CREATED
ORDER_CONFIRMED
PAYMENT_SUCCESS
PAYMENT_FAILED
ORDER_SHIPPED
ORDER_DELIVERED
PASSWORD_RESET
LOW_STOCK
```

---

# 6. API Server

The API server handles synchronous requests.

```text
Client
  │
  ▼
Fastify Route
  │
  ▼
Validation
  │
  ▼
Authentication
  │
  ▼
Authorization
  │
  ▼
Application Service
  │
  ▼
Repository
  │
  ▼
PostgreSQL
```

The API server should not perform long-running operations such as:

* Sending emails
* Processing large reports
* Heavy analytics
* Image processing
* Notification delivery

These operations should be delegated to the worker server.

---

# 7. Worker Server

The worker server handles asynchronous jobs.

Responsibilities:

* Email delivery
* Push notifications
* SMS delivery
* Analytics processing
* Report generation
* Cleanup jobs
* Inventory notifications
* Retry processing
* Scheduled jobs

Architecture:

```text
Redis Queue
     │
     ▼
Worker Server
     │
     ▼
Fetch Required Data
     │
     ▼
Execute Business Operation
     │
     ├───────────────┐
     │               │
     ▼               ▼
SUCCESS           FAILURE
     │               │
     ▼               ▼
COMPLETED        RETRY
                     │
                     ▼
                  FAILED
                     │
                     ▼
                    DLQ
```

---

# 8. Transactional Outbox Pattern

The Transactional Outbox Pattern ensures that database changes and event creation happen atomically.

Example:

```text
Create Order
      +
Create Outbox Event
      │
      ▼
Single Database Transaction
      │
      ▼
COMMIT
```

This prevents the problem where:

```text
Order Created Successfully

BUT

Event Was Never Sent
```

---

# 9. Outbox Events Table

Recommended schema:

| Column         | Type        | Description                |
| -------------- | ----------- | -------------------------- |
| id             | UUID / ULID | Unique event identifier    |
| event_type     | VARCHAR     | Type of event              |
| aggregate_type | VARCHAR     | Entity type                |
| aggregate_id   | VARCHAR     | Entity identifier          |
| payload        | JSONB       | Event data                 |
| status         | VARCHAR     | Current event state        |
| attempts       | INTEGER     | Number of publish attempts |
| locked_by      | VARCHAR     | Publisher instance         |
| locked_at      | TIMESTAMP   | Lock timestamp             |
| published_at   | TIMESTAMP   | Publishing completion time |
| created_at     | TIMESTAMP   | Event creation time        |
| updated_at     | TIMESTAMP   | Last update time           |

Example:

```text
outbox_events

id: EVT_01
event_type: ORDER_CREATED
aggregate_type: ORDER
aggregate_id: ORD_01

payload:
{
  "orderId": "ORD_01"
}

status: PENDING
attempts: 0
locked_by: null
locked_at: null
published_at: null
```

---

# 10. Outbox Event Lifecycle

The Outbox Publisher manages event delivery to the message queue.

```text
PENDING
   │
   │ Publisher Claims Event
   ▼
PROCESSING
   │
   ├──────────────────┐
   │                  │
   ▼                  ▼
PUBLISHED           ERROR
                      │
                      ▼
                 Retry Available
                      │
                      ▼
                   PENDING
                      │
                      ▼
                 Max Attempts
                      │
                      ▼
                    FAILED
```

Important:

> An outbox event is marked as `PUBLISHED` when it has been successfully handed to the queue. It does not wait for the worker to finish processing the business operation.

---

# 11. Outbox Publisher Flow

The publisher periodically fetches pending events.

```text
Every Few Seconds
       │
       ▼
Fetch Pending Events
       │
       ▼
Claim Event
       │
       ▼
Mark PROCESSING
       │
       ▼
Publish to Queue
       │
       ├───────────────┐
       │               │
       ▼               ▼
SUCCESS              FAILURE
       │               │
       ▼               ▼
PUBLISHED          RETRY
```

Recommended locking mechanism:

```sql
SELECT *
FROM outbox_events
WHERE status = 'PENDING'
ORDER BY created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` prevents multiple publisher instances from processing the same database row simultaneously.

---

# 12. Processing Lease and Timeout

A publisher can crash after claiming an event.

Example:

```text
PENDING
   │
   ▼
PROCESSING
   │
   ▼
Publisher Crashes
```

Without recovery, the event could remain in `PROCESSING` forever.

Use:

* `locked_at`
* `locked_by`
* Lease timeout

Example:

```text
PROCESSING
locked_at = 10:00:00
```

If the event remains locked longer than the configured lease duration:

```text
PROCESSING
     │
     ▼
Lease Expired
     │
     ▼
PENDING
     │
     ▼
Retry
```

---

# 13. Queue Worker Lifecycle

The worker lifecycle is separate from the Outbox lifecycle.

```text
WAITING
   │
   ▼
PROCESSING
   │
   ├─────────────────┐
   │                 │
   ▼                 ▼
COMPLETED          ERROR
                     │
                     ▼
                   RETRY
                     │
            ┌────────┴────────┐
            │                 │
            ▼                 ▼
        COMPLETED           FAILED
                                │
                                ▼
                               DLQ
```

---

# 14. Retry Strategy

Retries should use exponential backoff.

Example:

```text
Attempt 1
Wait 5 seconds

Attempt 2
Wait 30 seconds

Attempt 3
Wait 2 minutes

Attempt 4
Wait 10 minutes

Attempt 5
FAILED
```

The retry strategy prevents immediate repeated failures from overloading dependent systems.

---

# 15. Dead Letter Queue

A Dead Letter Queue stores jobs that cannot be successfully processed after the maximum retry count.

```text
Worker
  │
  ▼
Processing Failed
  │
  ▼
Retry
  │
  ▼
Retry Limit Reached
  │
  ▼
Dead Letter Queue
```

DLQ messages should support:

* Manual inspection
* Error analysis
* Manual retry
* Reprocessing
* Alerting

---

# 16. Idempotency

The system must assume that duplicate events can occur.

Example:

```text
Event Published to Queue Successfully

Publisher Crashes Before Marking Event PUBLISHED

Lease Expires

Event Published Again
```

The worker may receive the same event twice.

Workers must therefore be idempotent.

Example:

```text
Receive Event
     │
     ▼
Check Event ID
     │
 ┌───┴────┐
 │        │
 ▼        ▼
Exists   New
 │        │
Skip    Process
```

A processed event table can be used:

| Column        | Description          |
| ------------- | -------------------- |
| event_id      | Unique event         |
| consumer_name | Worker identifier    |
| status        | Processing state     |
| processed_at  | Completion timestamp |

---

# 17. Event Delivery Guarantee

The architecture provides:

```text
At-Least-Once Delivery
```

This means an event may occasionally be delivered more than once.

The combination of:

* Reliable event publishing
* Retry mechanisms
* Idempotent workers

provides safe and reliable processing.

---

# 18. Redis and BullMQ

Redis is used for:

* Job queues
* Delayed jobs
* Retry scheduling
* Rate limiting
* Caching
* Distributed coordination

BullMQ manages:

```text
WAITING
ACTIVE
COMPLETED
FAILED
DELAYED
```

The worker server consumes jobs independently from the API server.

---

# 19. Rate Limiting

Rate limiting should be configured by endpoint sensitivity.

Example:

| Endpoint Type  | Recommended Limit     |
| -------------- | --------------------- |
| General API    | 100 requests/minute   |
| Login          | 5 requests/minute     |
| Registration   | 5 requests/minute     |
| OTP            | 3 requests/minute     |
| Password Reset | 3 requests/15 minutes |
| Search         | 60 requests/minute    |

Redis should be used as the shared rate-limit store when multiple API servers are deployed.

```text
API Server 1
      │
API Server 2 ─────► Redis
      │
API Server 3
```

---

# 20. Authentication Architecture

```text
User Login
    │
    ▼
Validate Credentials
    │
    ▼
Verify Password
    │
    ▼
Generate Access Token
    │
    ▼
Generate Refresh Token
```

Recommended strategy:

* Short-lived access tokens
* Long-lived refresh tokens
* Refresh token rotation
* Refresh token hashing
* Session/device tracking

---

# 21. Security

The backend should implement:

* Argon2 password hashing
* JWT validation
* Refresh token rotation
* Rate limiting
* CORS configuration
* Helmet security headers
* Request validation
* SQL injection protection through ORM
* Webhook signature verification
* Audit logging
* Role-based access control
* Permission-based authorization

---

# 22. Role and Permission Architecture

Avoid relying only on roles.

Use permissions.

Example:

```text
ADMIN

products.create
products.update
products.delete

orders.read
orders.update

users.read
users.suspend
```

Authorization flow:

```text
Request
   │
   ▼
Authenticate User
   │
   ▼
Load Permissions
   │
   ▼
Check Required Permission
   │
   ├──────────┐
   │          │
ALLOW       DENY
```

---

# 23. Error Handling

Use a consistent error response format.

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_OUT_OF_STOCK",
    "message": "The requested product is currently out of stock"
  }
}
```

Error categories:

```text
VALIDATION_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
NOT_FOUND
CONFLICT
RATE_LIMITED
BUSINESS_RULE_ERROR
INTERNAL_ERROR
```

Internal system details should never be exposed to clients.

---

# 24. Logging and Monitoring

The system should log:

* API requests
* Errors
* Queue failures
* Worker failures
* Outbox publishing failures
* Retry attempts
* DLQ messages

Important metrics:

```text
API Response Time
Error Rate
Database Latency
Queue Size
Job Processing Time
Failed Jobs
Retry Count
DLQ Count
Outbox Pending Events
```

---

# 25. Deployment Architecture

```text
                         INTERNET
                            │
                            ▼
                      Load Balancer
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
            API SERVER 1          API SERVER 2
                 │                     │
                 └──────────┬──────────┘
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
             PostgreSQL              Redis
                                        │
                                        ▼
                              ┌────────────────┐
                              │ Worker Server  │
                              │                │
                              │ Worker 1       │
                              │ Worker 2       │
                              │ Worker 3       │
                              └────────────────┘
```

API servers and worker servers can scale independently.

---

# 26. Recommended Package Categories

## Core

```text
fastify
typescript
tsx
```

## Database

```text
prisma
@prisma/client
pg
```

## Redis and Jobs

```text
ioredis
bullmq
```

## Fastify Plugins

```text
@fastify/cors
@fastify/helmet
@fastify/jwt
@fastify/cookie
@fastify/rate-limit
@fastify/sensible
@fastify/compress
@fastify/multipart
```

## Validation

```text
zod
fastify-type-provider-zod
```

## Security

```text
argon2
```

## Documentation

```text
@fastify/swagger
@fastify/swagger-ui
```

## Logging

```text
pino-pretty
```

## Testing

```text
vitest
@vitest/coverage-v8
```

---

# 27. Final Event Flow

```text
1. Client Creates Order
        │
        ▼
2. API Validates Request
        │
        ▼
3. Database Transaction Starts
        │
        ├── Create Order
        │
        └── Create Outbox Event
        │
        ▼
4. Database Transaction Commits
        │
        ▼
5. Outbox Publisher Fetches Event
        │
        ▼
6. Event Marked PROCESSING
        │
        ▼
7. Event Published to Redis Queue
        │
        ▼
8. Outbox Event Marked PUBLISHED
        │
        ▼
9. Worker Receives Queue Job
        │
        ▼
10. Worker Executes Business Logic
        │
        ├───────────────┐
        │               │
        ▼               ▼
    SUCCESS           FAILURE
        │               │
        ▼               ▼
   COMPLETED          RETRY
                        │
                        ▼
                 Retry Limit Reached
                        │
                        ▼
                       FAILED
                        │
                        ▼
                        DLQ
```

---

# 28. Architecture Decision

The recommended architecture is:

```text
MODULAR MONOLITH

├── API SERVER
│
├── WORKER SERVER
│
├── PostgreSQL
│
├── Redis
│
├── BullMQ
│
└── Transactional Outbox Pattern
```

This architecture provides the best balance between:

* Development speed
* Operational simplicity
* Reliability
* Scalability
* Maintainability
* Future extensibility

The system can later evolve toward microservices if specific modules require independent deployment, scaling, or ownership.

The initial architecture, however, should remain a well-structured modular monolith to avoid unnecessary distributed-system complexity.



| Technology  | Best for                                  | Main advantage                                         |
| ----------- | ----------------------------------------- | ------------------------------------------------------ |
| **REST**    | Public APIs, simple CRUD, integrations    | Simple, cacheable, widely supported                    |
| **GraphQL** | Complex frontend data requirements        | Client requests exactly the data it needs              |


```
                    ┌──────────────────┐
                    │   Mobile App     │
                    │ React Native     │
                    └────────┬─────────┘
                             │
                    REST / GraphQL
                             │
                    ┌────────▼─────────┐
                    │   API Gateway    │
                    │                  │
                    │ REST + GraphQL   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ User     │   │ Order    │   │ Product  │
        │ Service  │   │ Service  │   │ Service  │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
             └─────────────────┼───────────┘
                      │
                   Database

```                    