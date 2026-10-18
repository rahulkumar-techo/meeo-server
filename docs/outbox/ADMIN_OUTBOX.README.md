# Transactional Outbox & Background Jobs - Admin Operations Guide

> **Base Route**: `/api/v1/outbox`  
> **Route File**: [`src/modules/outbox/routes/outbox.route.ts`](file:///e:/e-com/server/src/modules/outbox/routes/outbox.route.ts)  
> **Controller**: [`src/modules/outbox/controller/outbox.controller.ts`](file:///e:/e-com/server/src/modules/outbox/controller/outbox.controller.ts)  
> **Services**: [`src/modules/outbox/services/`](file:///e:/e-com/server/src/modules/outbox/services/)  
> **Queue Driver**: [`src/lib/queue.ts`](file:///e:/e-com/server/src/lib/queue.ts) (BullMQ + Redis)  
> **Target Audience**: DevOps Engineers, Site Reliability Engineers (SRE), Platform Administrators, Backend Engineers

---

## Table of Contents

1. [Architecture & Reliability Model](#architecture--reliability-model)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Queue Architecture (BullMQ & Redis)](#queue-architecture-bullmq--redis)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List Outbox Events (`GET /events`)](#1-list-outbox-events-get-events)
   - [2. Inspect Event Details & Error Diagnostics (`GET /events/:id`)](#2-inspect-event-details--error-diagnostics-get-eventsid)
   - [3. Trigger Immediate Batch Publishing (`POST /publish-now`)](#3-trigger-immediate-batch-publishing-post-publish-now)
   - [4. Manually Retry Failed Event (`POST /events/:id/retry`)](#4-manually-retry-failed-event-post-eventsidretry)
   - [5. System & BullMQ Operational Metrics (`GET /metrics`)](#5-system--bullmq-operational-metrics-get-metrics)
   - [6. Consumer Idempotency Audit Trail (`GET /processed`)](#6-consumer-idempotency-audit-trail-get-processed)
6. [Dead-Letter Queue (DLQ) & Failure Recovery Playbook](#dead-letter-queue-dlq--failure-recovery-playbook)
7. [Operational Error Codes Reference](#operational-error-codes-reference)

---

## Architecture & Reliability Model

The Transactional Outbox pattern guarantees **At-Least-Once Delivery** and prevents distributed dual-write inconsistencies between PostgreSQL and background queue brokers.

```
┌────────────────────────────────────────────────────────┐
│               PostgreSQL ACID Transaction              │
│                                                        │
│  1. INSERT INTO "Order" (...)                          │
│  2. UPDATE "Inventory" SET stock = stock - qty         │
│  3. INSERT INTO "OutboxEvent" (eventType, payload)     │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ (Committed atomically)
                            ▼
┌────────────────────────────────────────────────────────┐
│           Outbox Poller / Publisher Service            │
│                                                        │
│  1. Claim batch with distributed publisher lock        │
│  2. Enqueue into BullMQ (domain-events queue)          │
│  3. Mark OutboxEvent -> PUBLISHED                      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             BullMQ Redis Distributed Queue             │
│                Queue: "domain-events"                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Domain Consumers & Workers                 │
│                                                        │
│  • Notification Consumer (Email / Push / In-App)       │
│  • Order Analytics Consumer                            │
│  • Payment Webhook Finalizer Consumer                  │
│                                                        │
│  (Records idempotency key in "ProcessedEvent" table)   │
└────────────────────────────────────────────────────────┘
```

---

## Admin Permissions & Security Matrix

All administrative operations on the outbox and background job infrastructure require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the permission:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.SYSTEM_MANAGE` (`system:manage`) | Infrastructure & Jobs | Inspect outbox payloads, view queue depths, trigger manual publishing batches, re-enqueue failed events, audit processed idempotency keys |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted execution across all queue management and outbox recovery APIs |

---

## Queue Architecture (BullMQ & Redis)

The background worker subsystem uses two persistent Redis-backed BullMQ queues:

| Queue Name | Constant | Purpose | Retry & Retention Policy |
|---|---|---|---|
| **`domain-events`** | `QUEUE_NAMES.DOMAIN_EVENTS` | Primary message broker for all background domain events | 3 attempts, exponential backoff (2000ms), completed retained 24h, failed retained 7d |
| **`dead-letter-events`** | `QUEUE_NAMES.DEAD_LETTER` | Captures unrecoverable events that exhausted maximum outbox/worker retry attempts | Never auto-deleted; retained permanently for SRE inspection & manual replay |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/outbox/events` | `system:manage` | List outbox events with status, type, and pagination filters |
| `GET` | `/api/v1/outbox/events/:id` | `system:manage` | Inspect event payload, lock state, attempts, and error traces |
| `POST` | `/api/v1/outbox/publish-now` | `system:manage` | Force an immediate polling & enqueue batch cycle |
| `POST` | `/api/v1/outbox/events/:id/retry` | `system:manage` | Reset failed event attempt counter and re-queue for publishing |
| `GET` | `/api/v1/outbox/metrics` | `system:manage` | Live queue depths (waiting, active, failed) and outbox status totals |
| `GET` | `/api/v1/outbox/processed` | `system:manage` | Audit log of events executed by consumer handlers with idempotency keys |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. List Outbox Events (`GET /events`)

Lists all platform outbox records with status, event type, and aggregate filters.

- **Method**: `GET`
- **URL**: `/api/v1/outbox/events`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | `enum` | No | - | `PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED` |
| `eventType` | `string` | No | - | Filter by event type (e.g. `ORDER_CONFIRMED`, `PAYMENT_SUCCESS`) |
| `aggregateType` | `string` | No | - | Filter by domain aggregate (`Order`, `Payment`, `Product`) |
| `aggregateId` | `UUID` | No | - | Target specific entity ID |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "outbox-11111111-2222-3333-4444-555555555555",
        "eventType": "ORDER_CONFIRMED",
        "aggregateType": "Order",
        "aggregateId": "ord-22222222-3333-4444-5555-666666666666",
        "status": "PUBLISHED",
        "attempts": 1,
        "maxAttempts": 10,
        "lockedBy": null,
        "publishedAt": "2026-09-08T12:00:02.000Z",
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

##### Scenario 1.B: Error - Missing Permission (`403 Forbidden`)
```json
{
  "status": "error",
  "message": "Forbidden: Required permission 'system:manage' missing",
  "statusCode": 403
}
```

---

### 2. Inspect Event Details & Error Diagnostics (`GET /events/:id`)

Fetches the complete event document, full JSON payload, lock acquisition metadata, and last error diagnostics.

- **Method**: `GET`
- **URL**: `/api/v1/outbox/events/:id`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success - Succeeded Event (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "id": "outbox-11111111-2222-3333-4444-555555555555",
    "eventType": "ORDER_CONFIRMED",
    "aggregateType": "Order",
    "aggregateId": "ord-22222222-3333-4444-5555-666666666666",
    "status": "PUBLISHED",
    "payload": {
      "orderId": "ord-22222222-3333-4444-5555-666666666666",
      "orderNumber": "ORD-20260908-1001",
      "customerName": "John Doe",
      "customerEmail": "john@example.com",
      "totalAmount": "126.64",
      "currency": "USD"
    },
    "attempts": 1,
    "maxAttempts": 10,
    "lastError": null,
    "publishedAt": "2026-09-08T12:00:02.000Z",
    "createdAt": "2026-09-08T12:00:00.000Z"
  }
}
```

##### Scenario 2.B: Success - Failed / Retryable Event (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "id": "outbox-99999999-8888-7777-6666-555544443333",
    "eventType": "PAYMENT_SUCCEEDED",
    "aggregateType": "Payment",
    "aggregateId": "pay-11111111-2222-3333-4444-555555555555",
    "status": "FAILED",
    "attempts": 3,
    "maxAttempts": 10,
    "lastError": "Connection timeout connecting to Redis queue at 10.0.1.5:6379",
    "nextRetryAt": "2026-09-08T14:45:00.000Z",
    "createdAt": "2026-09-08T14:30:00.000Z"
  }
}
```

---

### 3. Trigger Immediate Batch Publishing (`POST /publish-now`)

Triggers an on-demand outbox poller batch. Recovers stale locks, claims eligible pending events, and enqueues them into BullMQ.

- **Method**: `POST`
- **URL**: `/api/v1/outbox/publish-now`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Request Body
```json
{
  "batchSize": 50
}
```

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Batch publish cycle completed",
  "data": {
    "claimedCount": 12,
    "publishedCount": 12,
    "failedCount": 0,
    "deadLetteredCount": 0
  }
}
```

---

### 4. Manually Retry Failed Event (`POST /events/:id/retry`)

Resets a failed or dead-lettered event's `status` back to `PENDING`, clears its `lockedBy` and `nextRetryAt` timers, allowing it to be immediately picked up on the next publish cycle.

- **Method**: `POST`
- **URL**: `/api/v1/outbox/events/:id/retry`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Outbox event queued for retry",
  "data": {
    "id": "outbox-99999999-8888-7777-6666-555544443333",
    "status": "PENDING",
    "attempts": 0,
    "nextRetryAt": null,
    "lastError": null
  }
}
```

##### Scenario 4.B: Error - Event Already Published (`400 Bad Request`)
```json
{
  "status": "error",
  "message": "Event is already in \"PUBLISHED\" status and cannot be retried",
  "statusCode": 400
}
```

---

### 5. System & BullMQ Operational Metrics (`GET /metrics`)

Retrieves live health status, combining PostgreSQL Outbox table counts with BullMQ Redis queue counts.

- **Method**: `GET`
- **URL**: `/api/v1/outbox/metrics`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "outbox": {
      "totalEvents": 24500,
      "pending": 3,
      "processing": 1,
      "published": 24490,
      "failed": 6
    },
    "queues": {
      "domainEvents": {
        "waiting": 2,
        "active": 1,
        "completed": 1000,
        "failed": 0,
        "delayed": 0
      },
      "deadLetter": {
        "waiting": 6,
        "active": 0,
        "completed": 0,
        "failed": 0,
        "delayed": 0
      },
      "timestamp": "2026-09-08T14:35:00.000Z"
    },
    "timestamp": "2026-09-08T14:35:00.000Z"
  }
}
```

---

### 6. Consumer Idempotency Audit Trail (`GET /processed`)

Audits the `ProcessedEvent` table which records execution statuses across consumers (`orderEventsConsumer`, `paymentEventsConsumer`, `notificationConsumer`), preventing duplicate side-effects.

- **Method**: `GET`
- **URL**: `/api/v1/outbox/processed?status=COMPLETED&page=1&limit=20`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "proc-11111111-2222-3333-4444-555555555555",
        "eventId": "outbox-11111111-2222-3333-4444-555555555555",
        "consumerName": "notificationConsumer",
        "status": "COMPLETED",
        "processedAt": "2026-09-08T12:00:03.000Z"
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

## Dead-Letter Queue (DLQ) & Failure Recovery Playbook

When an event fails repeatedly and reaches `attempts >= maxAttempts`:
1. **Automatic DLQ Transition**: The outbox publisher marks the event as `FAILED` and dispatches a copy into the `dead-letter-events` BullMQ queue.
2. **Alerting**: Monitoring systems trigger alerts when `metrics.queues.deadLetter.waiting > 0`.
3. **Investigation**: Inspect the root cause using `GET /api/v1/outbox/events/:id` (e.g. SMTP down, bad email format, database lock).
4. **Resolution & Replay**:
   - Fix downstream dependency.
   - Execute `POST /api/v1/outbox/events/:id/retry`.
   - Trigger `POST /api/v1/outbox/publish-now` to immediately reprocess.

---

## Operational Error Codes Reference

| HTTP Status | Error Code | Root Cause / Remedy |
|---|---|---|
| `400 Bad Request` | `INVALID_EVENT_STATE` | Attempting to retry a published event or invalid batch size |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing Bearer token |
| `403 Forbidden` | `FORBIDDEN` | Missing required `system:manage` permission |
| `404 Not Found` | `EVENT_NOT_FOUND` | Event UUID does not exist |
| `500 Internal Error`| `REDIS_CONNECTION_ERROR` | BullMQ unable to connect to Redis instance |
