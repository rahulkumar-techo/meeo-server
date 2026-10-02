# Background Workers & Notification Engine

This directory contains the background job workers powered by **BullMQ** and **Redis**. It handles asynchronous tasks like domain event processing, email delivery, mobile push notifications, and dead-letter queue (DLQ) retries.

---

## 1. Why are Notification Files Split Between `src/modules/notifications` and `src/workers`?

In this project, notifications are split into two distinct layers:

| Layer | Location | Purpose | Execution |
| :--- | :--- | :--- | :--- |
| **HTTP API Layer** | `src/modules/notifications/` | REST endpoints for users & admins (e.g. read notification history, update email/push preferences, admin manual broadcast) | Runs synchronously during HTTP requests (< 50ms) |
| **Worker / Job Layer** | `src/workers/` | Asynchronous delivery of emails (Brevo) and push notifications (Firebase FCM) triggered by system events (orders, payments) | Runs asynchronously in background via BullMQ jobs |

> **Why not send emails directly in the HTTP request?**  
> Sending emails or push notifications takes 500ms–3000ms and depends on external APIs (Brevo, Firebase). Doing this inside checkout or payment routes would make APIs slow, risk timeouts, and cause dropped notifications if the external service is down.

---

## 2. End-to-End Notification Flow

```
[1. User Action] Order placed / Payment verified
       │
       ▼
[2. PostgreSQL] Order status updated + OutboxEvent row inserted (Atomic Transaction)
       │
       ▼
[3. Outbox Publisher] Reads OutboxEvent → Publishes job to Redis queue ("domain-events")
       │
       ▼
[4. BullMQ Worker] (src/workers/domainEvent.worker.ts)
       │
       ▼
[5. Event Router] (src/workers/consumers/eventRouter.ts)
       │ Routes event to consumers based on eventType (e.g. ORDER_CONFIRMED)
       ▼
[6. Notification Consumer] (src/workers/consumers/notification.consumer.ts)
       │ Enriches recipient data (resolves user ID, email, name from DB)
       ▼
[7. Delivery Service] (src/workers/services/notificationDelivery.service.ts)
       │ - Checks user preferences (opt-in / opt-out)
       │ - Renders template (src/workers/templates/notificationTemplates.ts)
       │ - Selects channels (Push first, Email for invoices/receipts)
       ▼
[8. Channel Providers]
       ├── PushProvider (Firebase FCM)
       └── EmailProvider (Brevo / Nodemailer)
```

---

## 3. Directory Map & File Responsibilities

### `src/workers/`

```text
src/workers/
├── index.ts                      # Starts and stops BullMQ worker instances
├── domainEvent.worker.ts         # Worker listening to "domain-events" queue
├── deadLetter.worker.ts          # Worker handling failed jobs after max retries
│
├── consumers/
│   ├── eventRouter.ts            # Dispatches queue jobs to proper consumers
│   ├── notification.consumer.ts  # Handles notifications for orders, payments, security
│   ├── orderEvents.consumer.ts   # Handles order post-processing jobs
│   └── paymentEvents.consumer.ts # Handles payment confirmation & inventory holds
│
├── providers/
│   ├── email.provider.ts         # Transports emails via Brevo API / SMTP
│   ├── push.provider.ts          # Sends mobile/web push notifications via Firebase FCM
│   └── inApp.provider.ts         # Stores in-app alerts directly in PostgreSQL
│
├── services/
│   └── notificationDelivery.service.ts # Core logic: template rendering, preferences, channel selection
│
└── templates/
    └── notificationTemplates.ts  # Pre-compiled email & push copy for order, payment, and security events
```

---

## 4. Key Background Jobs Explained

### 1. `domainEvent.worker.ts`
- **Queue:** `domain-events`
- **Role:** Main worker process. Picks up jobs produced by the outbox publisher and routes them through `eventRouter.ts`.
- **Concurrency:** 5 concurrent jobs by default.

### 2. `notification.consumer.ts`
- **Role:** Idempotent consumer for domain events (`ORDER_CONFIRMED`, `ORDER_SHIPPED`, `PAYMENT_SUCCESS`, etc.).
- **Idempotency:** Tracks processed event IDs in `processed_events` table to prevent duplicate customer emails if a job is retried.

### 3. `notificationDelivery.service.ts`
- **Channel Strategy:**
  - **Push Notifications (FCM):** Sent for real-time order tracking and updates.
  - **Email (Brevo):** Sent for legal/financial events (invoices, receipts, security alerts, and order confirmations).
  - Respects customer preferences defined in `notification_preferences` table.

### 4. `deadLetter.worker.ts`
- **Queue:** `dead-letter-events`
- **Role:** Collects failed events after all BullMQ retries are exhausted for manual debugging or alert triggering.
