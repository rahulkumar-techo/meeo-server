# Enterprise E-Commerce Backend Platform

> **High-Throughput, Production-Ready Modular Monolith Architecture**  
> Built with Fastify, TypeScript, PostgreSQL (Prisma ORM 7), Redis (ioredis), BullMQ, Socket.io, and Node-Cron.

---

## 📑 Table of Contents

1. [High-Level Design (HLD)](#-high-level-design-hld)
   - [System Topology & Infrastructure](#system-topology--infrastructure)
   - [Synchronous vs Asynchronous Request Lifecycle](#synchronous-vs-asynchronous-request-lifecycle)
   - [Core Distributed Architecture Patterns](#core-distributed-architecture-patterns)
2. [Low-Level Design (LLD)](#-low-level-design-lld)
   - [Domain Architecture & Execution Pipeline](#domain-architecture--execution-pipeline)
   - [Domain Module Directory](#domain-module-directory)
   - [Order Lifecycle State Machine](#order-lifecycle-state-machine)
   - [Database Schema & Multi-File Architecture](#database-schema--multi-file-architecture)
3. [Reliability, Anti-Crash & SRE Safety](#-reliability-anti-crash--sre-safety)
   - [0.1ms Flood & DoS Defense](#01ms-flood--dos-defense)
   - [O(1) Ring Buffer Telemetry & Cardinality Guards](#o1-ring-buffer-telemetry--cardinality-guards)
   - [L1/L2 Multi-Tier Caching (Zero-DB Overhead)](#l1l2-multi-tier-caching-zero-db-overhead)
   - [4-Tier Error Classification Policy](#4-tier-error-classification-policy)
4. [Getting Started & Local Development](#-getting-started--local-development)
5. [Available NPM Scripts](#-available-npm-scripts)
6. [📚 Master Documentation Index & Markdown Directory](#-master-documentation-index--markdown-directory)

---

## 🏛️ High-Level Design (HLD)

### System Topology & Infrastructure

The platform is designed as an **Enterprise Modular Monolith**. It runs as a unified high-performance process in development and can be horizontally scaled as isolated worker/API container pods in production without codebase divergence.

```mermaid
flowchart TD
    subgraph Clients["Clients & Ingress Layer"]
        WebApp["Web App (Next.js)"]
        MobileApp["Mobile App (Flutter)"]
        AdminPortal["Admin Dashboard"]
    end

    subgraph Gateway["Fastify API Gateway"]
        Security["Helmet / CORS / 0.1ms Rate Limiter"]
        Auth["JWT Cookie & Bearer Rotation"]
        Validation["Zod Request Validation"]
        SocketHub["Socket.io Real-Time Hub"]
    end

    subgraph CoreDomain["Core Business Domains"]
        AuthDomain["Auth & Users"]
        CatalogDomain["Catalog & Search"]
        OrderDomain["Orders & Checkout"]
        PaymentDomain["Payments & Webhooks"]
        InventoryDomain["Inventory Engine"]
    end

    subgraph DataStorage["Persistence & Distributed State"]
        Postgres[("PostgreSQL (Prisma ORM 7)\nDomain Data + Outbox")]
        RedisCache[("Redis 7\nL2 Cache, Locks, Idempotency & Limits")]
        ObjectStorage[("ImageKit CDN\nAssets & Invoices")]
    end

    subgraph AsyncEngine["Asynchronous Processing Engine"]
        CronOutbox["Outbox Publisher Cron\n(Pessimistic Row Lock)"]
        CronSweeper["Order Sweeper Cron\n(TTL Stock Release)"]
        BullQueues["BullMQ Distributed Queues"]
        Workers["Async Consumer Workers\n(Notifications, Settlements, DLQ)"]
    end

    Clients -->|HTTPS / WSS| Gateway
    Gateway --> Security --> Auth --> Validation
    Validation --> CoreDomain
    SocketHub <--> RedisCache

    CoreDomain -->|Transactions| Postgres
    CoreDomain -->|L2 Cache / Locks| RedisCache
    CoreDomain -->|Media Uploads| ObjectStorage

    Postgres -->|Poll Pending Outbox| CronOutbox
    CronOutbox -->|Reliable Dispatch| BullQueues
    BullQueues --> Workers
    CronSweeper -->|Release Unpaid Holds| Postgres
    Workers -->|Status Events| SocketHub
```

### Synchronous vs Asynchronous Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client (Web / Mobile)
    participant Gateway as Fastify API Gateway
    participant Domain as Domain Service
    participant DB as PostgreSQL (Prisma)
    participant Cron as Outbox Cron
    participant Queue as BullMQ (Redis)
    participant Worker as Background Workers

    Note over Client,DB: 1. Synchronous Path (Fast Ingress & Atomic Commit)
    Client->>Gateway: POST /api/v1/orders (Checkout)
    Gateway->>Domain: Execute Order Creation
    Domain->>DB: Atomic Transaction [Insert Order + Insert OutboxEvent]
    DB-->>Domain: Transaction Committed
    Domain-->>Gateway: Order Created (201 Created)
    Gateway-->>Client: HTTP 201 Response (Immediate, Non-blocking)

    Note over DB,Worker: 2. Asynchronous Path (Guaranteed Event Dispatch)
    loop Every 5s (Pessimistic Row Lock)
        Cron->>DB: SELECT FOR UPDATE SKIP LOCKED
        DB-->>Cron: Pending Outbox Events
        Cron->>Queue: Enqueue Job (jobId = outboxId)
        Cron->>DB: UPDATE status = PUBLISHED
    end
    Queue->>Worker: Dequeue Event Job
    Worker->>Worker: Send Push / Email / Sync Search Index
    Worker-->>Queue: ACK Job Completed
```

1. **Synchronous Ingress Path**:
   * Client requests hit Fastify $\to$ `onRequest` rate limit check (0.1ms flood gate) $\to$ Authentication & RBAC $\to$ Zod body validation $\to$ Domain Service $\to$ PostgreSQL database transaction.
2. **Asynchronous Outbox & Worker Path**:
   * Instead of direct HTTP-to-Queue publishes (which cause dual-write inconsistency), state changes generate an `OutboxEvent` within the same atomic PostgreSQL transaction.
   * `outboxPublisher.cron` polls pending events via pessimistic row locks (`FOR UPDATE SKIP LOCKED`) every 5 seconds.
   * Events are dispatched to Redis-backed **BullMQ** queues with deterministic deduplication keys (`jobId = outboxId`).
   * BullMQ consumer workers process emails, notifications, search indexing, and payment reconciliation asynchronously.

### Core Distributed Architecture Patterns

| Pattern | Implementation | Guarantee |
| :--- | :--- | :--- |
| **Transactional Outbox** | PostgreSQL `outbox_events` + BullMQ | At-least-once message delivery without distributed 2PC |
| **Two-Phase Inventory Lock** | Redis atomic reservation + PostgreSQL commit | Zero overselling during high-volume drop sales |
| **Distributed Idempotency** | `x-idempotency-key` + Redis `SETNX` | Eliminates duplicate checkouts on client network retries |
| **Dead-Letter Queue (DLQ)** | BullMQ `dead-letter-events` | Automatic isolation of poison-pill messages for auditing |
| **Multi-Tier Caching** | L1 Memory + L2 Redis + Redis Pub/Sub | 0ms read latency with zero database overhead on hot paths |

---

## 🛠️ Low-Level Design (LLD)

### Domain Architecture & Execution Pipeline

Each module inside `src/modules/` adheres to a clean layered architecture, ensuring separation of concerns, testability, and strict type safety:

```mermaid
flowchart LR
    Req([HTTP / WS Request]) --> Route["Fastify Route\nsrc/modules/*/routes"]
    Route --> Guard["Pre-Handlers / Guards\nAuth, RBAC & Context"]
    Guard --> Val{"Zod Schema\nValidation"}
    Val -- Valid --> Ctrl["Controller\nSerialization & Status"]
    Val -- Invalid --> Err(["400 / 422 Client Error"])
    Ctrl --> Svc["Domain Service\nBusiness Rules & Logic"]
    Svc --> Repo["Repository Layer\nData Access Abstraction"]
    Repo --> DB[("PostgreSQL\nPrisma ORM 7")]
    Repo --> Cache[("Redis\nL1/L2 Cache & Locks")]
    Svc -.-> Outbox[("Outbox Table\nAtomic Event Log")]
    Ctrl --> Res(["HTTP Response\nStandard JSON Output"])
```

### Domain Module Directory

The codebase is organized as isolated domain modules inside `src/modules/`. Each domain encapsulates its own routes, controllers, services, repositories, and validations:

| Domain Module | Primary Responsibilities | Core Entities / Models |
| :--- | :--- | :--- |
| **`auth`** | Token rotation, Argon2 password hashing, OAuth, sessions | `User`, `AuthSession`, `RefreshToken` |
| **`user`** | Customer profiles, multi-address books, phone verification | `User`, `Address`, `UserProfile` |
| **`catalog`** | Product hierarchies, SKU variants, attributes, brands | `Product`, `ProductVariant`, `Category`, `Attribute` |
| **`inventory`** | Two-phase stock holds, quantity adjustments, warehouse logs | `InventoryItem`, `StockReservation`, `InventoryLog` |
| **`cart`** | Ephemeral cart state, guest cart migration, discount checks | `Cart`, `CartItem` |
| **`orders`** | Order state machine, invoice generation, cancellation | `Order`, `OrderItem`, `OrderStatusHistory` |
| **`payments`** | Gateway integrations (Razorpay/Stripe), webhooks, refunds | `PaymentTransaction`, `PaymentRefund`, `PaymentWebhook` |
| **`tax` (GST)** | HSN codes, interstate IGST, intrastate CGST+SGST engine | `TaxRule`, `TaxSlab`, `HsnCode` |
| **`coupons`** | Code validation, usage limits, minimum order constraints | `Coupon`, `CouponUsage` |
| **`promotions`** | Automatic basket discounts, buy-X-get-Y rules | `Promotion`, `PromotionCondition` |
| **`outbox`** | Transactional outbox polling, event routing, retry tracking | `OutboxEvent`, `ProcessedEvent` |
| **`notifications`** | In-app notification center, FCM push, Brevo email dispatch | `Notification`, `NotificationPreference` |
| **`observability`** | Prometheus telemetry, Loki log streaming, dynamic alerts | `ObservabilityConfig` |
| **`audit`** | Immutable administrative audit trails for compliance | `AuditLog` |

### Order Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Customer Initiates Checkout
    PENDING --> PAYMENT_PENDING: Reserve Stock (Atomic Redis Lock)
    PENDING --> EXPIRED: Checkout Abandoned / Session Drop

    PAYMENT_PENDING --> CONFIRMED: Payment Webhook Verified
    PAYMENT_PENDING --> EXPIRED: 15-Min TTL Timeout (orderSweeper.cron)
    PAYMENT_PENDING --> CANCELLED: Customer Aborts Checkout

    CONFIRMED --> PROCESSING: Warehouse Pick & Pack
    CONFIRMED --> CANCELLED: Admin / Seller Cancellation (Auto-Refund)

    PROCESSING --> SHIPPED: Courier Handover & Tracking Issued
    SHIPPED --> DELIVERED: Proof of Delivery Verified
    DELIVERED --> REFUNDED: Return Approved (Restock Inventory)

    CANCELLED --> [*]
    EXPIRED --> [*]
    DELIVERED --> [*]
    REFUNDED --> [*]
```

* **TTL Expiration**: Orders in `PAYMENT_PENDING` without payment confirmation within 15 minutes are transitioned to `EXPIRED` by `orderSweeper.cron.ts`, automatically restoring reserved stock.
* **Idempotency**: All payment callbacks and order status updates are strictly idempotent.

### Database Schema & Multi-File Architecture

Prisma schema files are decoupled by domain slices in `prisma/schema/` using Prisma ORM 7 multi-file schema support:

* `prisma/schema/Identity/` — Users, roles, permissions, addresses.
* `prisma/schema/Catalog/` — Products, variants, categories, images.
* `prisma/schema/Orders/` — Orders, items, order tracking, state history.
* `prisma/schema/Payments/` — Transactions, refunds, webhooks.
* `prisma/schema/Inventory/` — Stock reservations, quantity logs.
* `prisma/schema/Infrastructure/` — `outboxEvent`, `auditLog`, `observabilityConfig`.

---

## 🛡️ Reliability, Anti-Crash & SRE Safety

### 0.1ms Flood & DoS Defense
* **TCP Socket Termination**: Evaluated at the `onRequest` Fastify hook. If an IP exceeds `ban: 100` rapid requests past the limit, the underlying TCP connection is destroyed (`req.raw.destroy()`). Zero CPU or memory is wasted generating JSON 429 response frames.
* **Shared Redis Sliding Window**: Rate limits are synchronized cluster-wide via Redis.

### O(1) Ring Buffer Telemetry & Cardinality Guards
* **Constant Time Telemetry**: In-memory latency samples use a fixed-size Circular Ring Buffer (`httpIndex = (httpIndex + 1) % 5000`) instead of expensive $O(N)$ `Array.shift()` operations, eliminating GC spikes.
* **Route Cardinality Protection**: Dynamic path IDs (UUIDs, ObjectIDs, numeric IDs) are sanitized into `:id`. Unique route tracking is capped at `300` routes; overflow paths are grouped under `/OTHER` to prevent Out-Of-Memory (OOM) attacks.
* **Live Log Stream Concurrency**: SSE log streaming is restricted to a maximum of `5` concurrent sessions with a `50 logs/tick` micro-batch limit and automatic disconnect resource cleanup.

### L1/L2 Multi-Tier Caching (Zero-DB Overhead)
* **L1 In-Memory Map**: Serves dynamic configuration and alerts in `< 0.001ms` with 0 network calls.
* **L2 Redis Cache**: Shared distributed cache fallback across instances.
* **Event-Driven Cache Busting**: Administrative threshold updates write to PostgreSQL, refresh Redis, and broadcast an eviction message via Redis Pub/Sub (`channel:observability:config_changed`) to synchronize all node L1 caches instantly.

### 4-Tier Error Classification Policy

1. **HTTP Server Errors (5xx)**: User-impacting platform failures (`500–599`). Default alert: Warning `> 2%`, Critical `> 5%`.
2. **HTTP Client Errors (4xx)**: Client validation issues (`400, 404, 405, 413, 415, 422`). Excludes expected business conflicts (`409, 410`).
3. **Security & Policy Events**: `401 Unauthorized, 403 Forbidden, 429 Rate-Limited`. 401 alerts are filtered to `/auth/login` to prevent expired token refresh loops at 1M+ scale from causing alert noise.
4. **Business Operation Failures**: Domain transaction failures (payment declines, checkout locks, BullMQ DLQ depth) independent of HTTP 200 response codes.

---

## 🚀 Getting Started & Local Development

### Prerequisites
* **Node.js**: v20.x or higher
* **PostgreSQL**: v15.x or higher
* **Redis**: v7.x or higher

### Environment Configuration
Create a `.env` file in the root directory:

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ecom?schema=public"

# Redis Cache & Queue Connection
REDIS_URL="redis://localhost:6379"

# Security & Secrets
JWT_SECRET="your-super-secure-jwt-secret-min-32-chars"
REFRESH_TOKEN_SECRET="your-super-secure-refresh-token-secret"
COOKIE_SECRET="your-cookie-signing-secret"

# Background & Cron Configurations
OUTBOX_CRON_EXPRESSION="*/5 * * * * *"
ORDER_SWEEPER_CRON_EXPRESSION="*/5 * * * *"
HEARTBEAT_CRON_EXPRESSION="*/10 * * * * *"
```

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client & deploy schema
npm run prisma:generate
npm run prisma:deploy

# 3. Start development server (HTTP + WebSockets + BullMQ + Cron)
npm run dev
```

---

## 📜 Available NPM Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch src/server.ts` | Starts hot-reloading development server |
| `npm run build` | `npm run prisma:generate && tsc && tsc-alias` | Builds production bundle with module aliases |
| `npm start` | `npm run prisma:deploy && node dist/server.js` | Runs production server |
| `npm test` | `vitest` | Interactive unit & integration test runner |
| `npm test -- --run` | `vitest run` | Runs all test suites once |
| `npm run typecheck` | `tsc --noEmit` | Strict TypeScript type validation |
| `npm run ci:verify` | Full verify pipeline | Production build + typecheck + test validation |

---

## 📚 Master Documentation Index & Markdown Directory

Direct clickable directory to all architectural specifications, operational r### 1. 🔍 Observability, Telemetry & Production Operations
* [OBSERVABILITY_CHECKLIST.md](file:///e:/e-com/server/docs/observability/OBSERVABILITY_CHECKLIST.md) — Master 10-point server monitoring checklist, production tool responsibility matrix, granular observability endpoints, alert thresholds, and Admin Dashboard integration guide.
* [OBSERVABILITY_PRODUCTION_RULES.md](file:///e:/e-com/server/docs/observability/OBSERVABILITY_PRODUCTION_RULES.md) — Production rules matrix, 0.1ms rapid-fire flood protection, O(1) circular ring buffer, route cardinality sanitization, and live log stream limits.
* [OBSERVABILITY_INTEGRATION.md](file:///e:/e-com/server/docs/observability/OBSERVABILITY_INTEGRATION.md) — Fastify Observability API contracts, Loki LogQL streaming, Prometheus presets, and React Flow topology mapping.

### 2. 🔐 Identity, Authentication & Permissions
* [AUTH.md](file:///e:/e-com/server/docs/auth/AUTH.md) — Authentication architecture, JWT token rotation, and refresh token security.
* [CUSTOMER_AUTH.md](file:///e:/e-com/server/docs/auth/CUSTOMER_AUTH.md) — Customer-facing authentication flows, OTP verification, and social login.
* [ADMIN_USER.README.md](file:///e:/e-com/server/docs/auth/ADMIN_USER.README.md) — Admin user management and profile administration.
* [ADMIN_AUTHORIZATION.README.md](file:///e:/e-com/server/docs/auth/ADMIN_AUTHORIZATION.README.md) — Role-based access control (RBAC) and permission matrices.
* [publicAuthRoutes.md](file:///e:/e-com/server/docs/auth/publicAuthRoutes.md) — Public customer authentication routes reference.

### 3. 📦 Catalog, Products & Inventory
* [Catalog.md](file:///e:/e-com/server/docs/catalog/Catalog.md) — Product catalog architecture, variants, and stock management.
* [product.README.md](file:///e:/e-com/server/docs/catalog/product.README.md) — Product catalog endpoints and CRUD operations.
* [DASHBOARD_INTEGRATION.md](file:///e:/e-com/server/docs/catalog/DASHBOARD_INTEGRATION.md) — Admin dashboard integration for catalog, categories, and inventory.
* [attribute.README.md](file:///e:/e-com/server/docs/catalog/attribute.README.md) — Custom attributes, specifications, and filtering facets.
* [variant.md](file:///e:/e-com/server/docs/catalog/variant.md) — SKU variants, pricing, and stock assignment.
* [IMAGES_AND_VARIANTS_GUIDE.md](file:///e:/e-com/server/docs/catalog/IMAGES_AND_VARIANTS_GUIDE.md) — Media upload pipelines, ImageKit integration, and variant images.
* [Inventory.md](file:///e:/e-com/server/docs/inventory/Inventory.md) — Two-phase inventory reservation and stock locks architecture.

### 4. 🛒 Orders, Checkout, Payments & Coupons
* [ADMIN_ORDER.README.md](file:///e:/e-com/server/docs/orders/ADMIN_ORDER.README.md) — Order processing, status transitions, and fulfillment workflows.
* [Payment.md](file:///e:/e-com/server/docs/payments/Payment.md) — Payment gateway architecture, intent lifecycle, and webhook verification.
* [ADMIN_PAYMENTS.README.md](file:///e:/e-com/server/docs/payments/ADMIN_PAYMENTS.README.md) — Payment gateway integration and reconciliation runbooks.
* [ADMIN_COUPONS.README.md](file:///e:/e-com/server/docs/coupons/ADMIN_COUPONS.README.md) — Promotional codes, discounts, and usage constraints.
* [promotions.README.md](file:///e:/e-com/server/docs/coupons/promotions.README.md) — Dynamic discount engines and promotion rules.

### 5. ⚡ Event-Driven Infrastructure, Background Jobs & Sockets
* [ADMIN_BACKGROUND_JOBS.README.md](file:///e:/e-com/server/docs/jobs/ADMIN_BACKGROUND_JOBS.README.md) — BullMQ job queue management, active workers, and retry policies.
* [ADMIN_OUTBOX.README.md](file:///e:/e-com/server/docs/outbox/ADMIN_OUTBOX.README.md) — Transactional outbox pattern and event publishing engine.
* [workers.README.md](file:///e:/e-com/server/docs/jobs/workers.README.md) — Background queue consumer workers.
* [SOCKETS.md](file:///e:/e-com/server/docs/sockets/SOCKETS.md) — Real-time Socket.io server architecture and event rooms.
* [SOCKET_CLIENT_INTEGRATION.md](file:///e:/e-com/server/docs/sockets/SOCKET_CLIENT_INTEGRATION.md) — Frontend client integration guide for real-time order tracking.

### 6. 🏛️ Compliance, Tax (GST) & System Settings
* [docs/gst/README.md](file:///e:/e-com/server/docs/gst/README.md) — Master GST calculation engine, HSN codes, and compliance rules.
* [docs/gst/ADMIN_GUIDE.md](file:///e:/e-com/server/docs/gst/ADMIN_GUIDE.md) — Administrator guide for GST rules and tax slabs.
* [docs/gst/API_REFERENCE.md](file:///e:/e-com/server/docs/gst/API_REFERENCE.md) — Comprehensive GST endpoints reference.
* [AUDIT_REPORT.md](file:///e:/e-com/server/docs/audit/AUDIT_REPORT.md) — System audit report and architecture compliance summary.
* [ADMIN_AUDIT.README.md](file:///e:/e-com/server/docs/audit/ADMIN_AUDIT.README.md) — Audit logging and immutable compliance history.
* [ADMIN_SETTINGS.README.md](file:///e:/e-com/server/docs/settings/ADMIN_SETTINGS.README.md) — Global platform configuration and dynamic settings.
* [ADMIN_REVIEWS.README.md](file:///e:/e-com/server/docs/reviews/ADMIN_REVIEWS.README.md) — Product review moderation and rating verification.
* [Database.md](file:///e:/e-com/server/docs/architecture/Database.md) — Database schema design, indices, and relations.
* [RBAC.md](file:///e:/e-com/server/docs/architecture/RBAC.md) — Role-based access control matrix and permission architecture.
* [CLIENT_TRACKING_IMPLEMENTATION.md](file:///e:/e-com/server/docs/tracking/CLIENT_TRACKING_IMPLEMENTATION.md) — Frontend client user activity and tracking integration guide.

### 7. 📱 Customer Mobile & Web API Journey
* [docs/customer-journey/README.md](file:///e:/e-com/server/docs/customer-journey/README.md) — Complete 15-module customer journey walkthrough (Auth, Catalog, Cart, Checkout, Tracking).