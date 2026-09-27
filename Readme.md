# Enterprise E-Commerce Backend Platform

> **Production-Ready, High-Throughput Modular Monolith Architecture**  
> Powered by Fastify, TypeScript, PostgreSQL (Prisma ORM), Redis, BullMQ, Socket.io, and Node-Cron.

---

## 📑 Table of Contents

1. [System Overview & Architectural Philosophy](#-system-overview--architectural-philosophy)
2. [High-Level System Topology](#-high-level-system-topology)
3. [Technology Stack](#-technology-stack)
4. [Repository & Codebase Structure](#-repository--codebase-structure)
5. [Core Domain Modules](#-core-domain-modules)
6. [Resilience & Event-Driven Patterns](#-resilience--event-driven-patterns)
7. [Background Workers & Scheduled Cron Engine](#-background-workers--scheduled-cron-engine)
8. [Real-Time WebSocket Architecture](#-real-time-websocket-architecture)
9. [Observability & Operational Health](#-observability--operational-health)
10. [Getting Started & Local Development](#-getting-started--local-development)
11. [Available NPM Scripts](#-available-npm-scripts)
12. [API & Interactive Documentation](#-api--interactive-documentation)

---

## 🏛️ System Overview & Architectural Philosophy

This platform implements an **Enterprise Modular Monolith** designed for high concurrency, fault tolerance, and developer velocity. It balances strict domain isolation with low operational complexity:

* **Single Unified Process**: API endpoints, WebSockets, background BullMQ workers, and scheduled cron jobs run cohesively in a single process during development, while remaining decoupled for independent containerized scaling in production.
* **Transactional Outbox Guarantee**: All state changes and domain events are persisted in atomic database transactions, preventing data inconsistency between PostgreSQL and external message brokers.
* **Two-Phase Inventory Reservations**: Stock is reserved with a TTL during checkout and committed upon payment confirmation, eliminating overselling in high-traffic drop-sales.
* **Zero-Downtime Resilience**: Automatic reconnects, exponential backoff retries, dead-letter queues (DLQ), and self-healing cron sweepers keep the system healthy under transient failures.

---

## 🌐 High-Level System Topology

```text
                                CLIENTS & FRONTEND
                      (Web App / Mobile App / Admin Portal)
                                       │
                                       │ HTTPS / WSS
                                       ▼
                     ┌───────────────────────────────────┐
                     │          FASTIFY GATEWAY          │
                     │  - Helmet / CORS / Rate Limiting  │
                     │  - JWT Cookie & Bearer Auth       │
                     │  - Zod Request Validation         │
                     └─────────┬───────────────┬─────────┘
                               │               │
                     ┌─────────▼────────┐      │
                     │  REST & GRAPHQL  │      │
                     │  BUSINESS DOMAIN │      │
                     └─────────┬────────┘      │
                               │               │
        ┌──────────────────────┼───────────────┼──────────────────────┐
        │                      │               │                      │
        ▼                      ▼               ▼                      ▼
┌───────────────┐      ┌───────────────┐ ┌───────────────┐    ┌───────────────┐
│  POSTGRESQL   │      │  REDIS CACHE  │ │   SOCKET.IO   │    │ OBJECT STORAGE│
│  (Prisma ORM) │      │  & IDEMPOTENCY│ │ REAL-TIME HUB │    │  (ImageKit)   │
│               │      │               │ │               │    │               │
│ - Domain Data │      │ - API Cache   │ │ - Order Feeds │    │ - Product CDN │
│ - Outbox Table│      │ - Rate Limits │ │ - Admin Tele- │    │ - Invoices    │
│ - Event Logs  │      │ - Locks & TTL │ │   metry       │    │               │
└───────┬───────┘      └───────┬───────┘ └───────────────┘    └───────────────┘
        │                      │
        │ Atomic Poller        │ Queue Broker
        ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ASYNC ENGINE & WORKER THREADS                         │
│                                                                             │
│  ┌────────────────────────┐              ┌────────────────────────┐         │
│  │   SCHEDULED CRON JOBS  │              │     BULLMQ WORKERS     │         │
│  │   (node-cron)          │              │                        │         │
│  │                        │              │ - Domain Event Router  │         │
│  │ - Outbox Publisher     ├─────────────►│ - Order Notification   │         │
│  │ - Stale Order Sweeper  │              │ - Payment Settlement   │         │
│  │ - Node Heartbeat Relay │              │ - Dead Letter (DLQ)    │         │
│  └────────────────────────┘              └────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Technology Stack

| Layer | Technologies | Key Advantages |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js (v20+), TypeScript 5.8+ | Strongly typed, async I/O, modern ES modules |
| **HTTP Framework** | Fastify v5 | High-throughput, low-overhead HTTP lifecycle |
| **Database & ORM** | PostgreSQL 15+, Prisma ORM 7 | Multi-file modular schema, strict relations |
| **Caching & Queues** | Redis 7+ (ioredis), BullMQ | High-speed cache, distributed FIFO/priority queues |
| **Scheduling** | `node-cron` | Declarative cron jobs for polling & self-healing sweepers |
| **Real-Time** | Socket.io v4 | Bi-directional events with room-based pub/sub |
| **API Protocols** | REST (OpenAPI 3 / Swagger) + GraphQL (Yoga) | Flexible client integration and complete schema docs |
| **Security & Auth** | Argon2, JWT, HttpOnly Cookies, Helmet, Rate Limits | Production security baseline and brute-force defense |
| **Testing** | Vitest 4, Supertest | Rapid unit, integration, and E2E test execution |

---

## 📁 Repository & Codebase Structure

```text
server/
├── prisma/                          # Multi-file Prisma schema configuration
│   ├── schema/                      # Domain schema slices (auth, catalog, orders, etc.)
│   └── schema.prisma                # Aggregated root Prisma schema
│
├── src/
│   ├── common/                      # Cross-cutting primitives
│   │   ├── errors/                  # AppError, standard HTTP exceptions
│   │   ├── middleware/              # Auth guards, RBAC, rate-limiting hooks
│   │   ├── utils/                   # Crypto, pagination, date, response helpers
│   │   └── docs/                    # Swagger & OpenAPI documentation models
│   │
│   ├── config/                      # Environment schema validation (Zod)
│   ├── lib/                         # Core infrastructure singletons (Prisma, Redis, BullMQ)
│   │
│   ├── cron/                        # 🕒 Scheduled Periodic Cron Jobs (node-cron)
│   │   ├── outboxPublisher.cron.ts  # Outbox table -> BullMQ event publisher
│   │   ├── orderSweeper.cron.ts     # Abandoned checkout & reservation reaper
│   │   ├── workerHeartbeat.cron.ts  # Node heartbeat & observability reporter
│   │   └── index.ts                 # Unified lifecycle manager (start/stop)
│   │
│   ├── jobs/                        # 🐂 Background Jobs & Worker Infrastructure
│   │   ├── controller/              # Admin Job Monitoring endpoints
│   │   ├── routes/                  # /api/v1/jobs routing table
│   │   ├── services/                # Telemetry, queue metrics, DLQ replay
│   │   └── workers/                 # BullMQ Queue Processors
│   │       ├── domainEvent.worker.ts# Main domain event processor
│   │       ├── deadLetter.worker.ts # Dead Letter Queue processor & alerts
│   │       └── index.ts             # BullMQ worker lifecycle manager
│   │
│   ├── modules/                     # 📦 Core Domain Modules (Modular Monolith)
│   │   ├── auth/                    # Login, register, token rotation, sessions
│   │   ├── users/                   # Profiles, addresses, security settings
│   │   ├── catalog/                 # Products, categories, attributes, brands
│   │   ├── inventory/               # Two-phase reservations, stock logs
│   │   ├── cart/                    # Cart items, guest merge, validations
│   │   ├── wishlist/                # User wishlists & stock alerts
│   │   ├── orders/                  # Order state machine, invoices, sweepers
│   │   ├── payments/                # Razorpay/Stripe, webhooks, refunds
│   │   ├── coupons/                 # Coupon codes, validation, usage tracking
│   │   ├── promotions/              # Automatic promotions engine, rules
│   │   ├── reviews/                 # Product reviews, ratings, verification
│   │   ├── notifications/           # In-app, push & email notification consumers
│   │   ├── search/                  # Fuzzy filtering, suggestions, autocomplete
│   │   ├── dashboard/               # Admin analytics & business KPIs
│   │   ├── auditLog/                # Compliance & administrative audit trail
│   │   └── outbox/                  # Transactional outbox event router & retry
│   │
│   ├── sockets/                     # ⚡ Real-Time Socket.io Server & Rooms
│   ├── app.ts                       # Fastify application factory & plugin registry
│   └── server.ts                    # Application entrypoint (HTTP + Socket + Workers + Cron)
│
└── src/__tests__/                   # Comprehensive Unit & Integration Test Suites (49+ suites)
```

---

## 📦 Core Domain Modules

### 1. 🔐 Authentication & Session Security
* **Access & Refresh Tokens**: Dual-token architecture using HttpOnly, SameSite cookies with body fallback.
* **Token Rotation**: Refresh tokens are single-use with automatic token revocation upon detection of reuse attempts.
* **Password Hashing**: State-of-the-art memory-hard hashing via Argon2id.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions for `CUSTOMER`, `STAFF`, and `ADMIN`.

### 2. 🛍️ Product Catalog & Search
* **Flexible Variations**: Color/size variants, custom specifications, SKU tracking, and image galleries.
* **Hierarchical Categories**: Recursive category trees with nested subcategory queries.
* **Cursor Pagination**: Ultra-fast compound cursor pagination (`id + createdAt`) avoiding expensive `OFFSET` queries.
* **Search Engine**: Fuzzy search with price filtering, rating filters, brand/category facets, and autocomplete.

### 3. 📦 Two-Phase Inventory Management
* **Phase 1 (Reservation)**: When a customer begins checkout, stock is atomically shifted from `availableQuantity` to `reservedQuantity` with an expiration TTL (e.g. 15 minutes).
* **Phase 2 (Confirmation / Release)**: Upon payment success, reservations are committed to permanent deductions. If checkout is cancelled or times out, the stock is released back into available inventory.

### 4. 🧾 Orders & Checkout State Machine
```text
[ PENDING ] ────────► [ PAYMENT_PENDING ] ────────► [ CONFIRMED ] ────────► [ PROCESSING ] ────────► [ SHIPPED ] ────────► [ DELIVERED ]
     │                        │                           │
     ▼                        ▼                           ▼
[ EXPIRED ]              [ CANCELLED ]               [ REFUNDED ]
```
* **Price Snapshots**: Immutable captures of unit price, applied coupon, and tax rate at checkout time.
* **Idempotency**: All mutation endpoints accept `x-idempotency-key` to prevent duplicate checkouts on network retries.

### 5. 💳 Payments & Webhook Verification
* **Payment Gateways**: Webhook integration with signature verification and replay protection.
* **Refund Pipeline**: Partial and full refund execution with automatic inventory adjustments.

---

## 🛡️ Resilience & Event-Driven Patterns

### Transactional Outbox Pattern
To prevent distributed transaction failures, domain events are never sent directly to message brokers inside HTTP handlers. Instead:
1. Business data and an `OutboxEvent` are written to PostgreSQL inside a single database transaction.
2. A high-frequency `node-cron` sweeper claims pending outbox events using pessimistic row locks (`PROCESSING` state).
3. The events are published to BullMQ with deduplication keys (`jobId = outboxId`).
4. Upon successful publish, the event is marked `PUBLISHED`. If retries fail, it routes to the `DEAD_LETTER` queue.

### Dead Letter Queue (DLQ) & Self-Healing
* Unhandled consumer errors or poison-pill payloads are forwarded to `dead-letter-events`.
* Administrators can inspect payload details, examine error stack traces, and trigger manual replays via `/api/v1/jobs/:id/retry` or bulk purge actions.

---

## 🕒 Background Workers & Scheduled Cron Engine

All background workloads are neatly decoupled into dedicated directories:

| Component | Path | Tooling | Purpose |
| :--- | :--- | :--- | :--- |
| **Outbox Cron** | [`src/cron/outboxPublisher.cron.ts`](file:///e:/e-com/server/src/cron/outboxPublisher.cron.ts) | `node-cron` | Scans outbox every 5s and relays events to BullMQ |
| **Order Sweeper** | [`src/cron/orderSweeper.cron.ts`](file:///e:/e-com/server/src/cron/orderSweeper.cron.ts) | `node-cron` | Auto-cancels abandoned checkouts and releases held stock |
| **Worker Heartbeat** | [`src/cron/workerHeartbeat.cron.ts`](file:///e:/e-com/server/src/cron/workerHeartbeat.cron.ts) | `node-cron` | Emits node health telemetry to Redis every 10s |
| **Domain Event Worker** | [`src/jobs/workers/domainEvent.worker.ts`](file:///e:/e-com/server/src/jobs/workers/domainEvent.worker.ts) | BullMQ | Consumes order, payment, and inventory domain events |
| **DLQ Worker** | [`src/jobs/workers/deadLetter.worker.ts`](file:///e:/e-com/server/src/jobs/workers/deadLetter.worker.ts) | BullMQ | Catches failed events for operator auditing and retry |

---

## ⚡ Real-Time WebSocket Architecture

WebSocket communication is powered by **Socket.io** (`/socket.io`), organized into secured rooms:

* **User Channel** (`user:${userId}`): Live order status changes, payment confirmations, and personalized notifications.
* **Order Tracking Channel** (`order:${orderId}`): Courier tracking, delivery coordinates, and shipment updates.
* **Admin Telemetry Channel** (`admin:telemetry`): Real-time queue latency, job throughput, active workers, and system alerts.

---

## 📊 Observability & Operational Health

* **Health Probes**:
  * `GET /health` — Overall readiness, uptime, and database/Redis ping status.
  * `GET /health/ready` — Kubernetes readiness probe.
  * `GET /health/live` — Kubernetes liveness probe.
  * `GET /health/workers` — Active worker nodes, CPU/RAM telemetry, and heartbeats.
* **Prometheus Metrics**: `GET /metrics` exports standard runtime and Fastify request latencies.
* **Structured Logging**: JSON logging via Pino with correlation `requestId` propagation across all operations.

---

## 🚀 Getting Started & Local Development

### 1. Prerequisites
* **Node.js**: v20.x or higher
* **PostgreSQL**: v15.x or higher
* **Redis**: v7.x or higher

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ecommerce_db?schema=public"

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

### 3. Install & Initialize
```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client & synchronize database schema
npm run prisma:generate
npm run prisma:migrate

# 3. Start development server (HTTP + WebSockets + BullMQ + Cron)
npm run dev
```

---

## 📜 Available NPM Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch src/server.ts` | Starts hot-reloading development server |
| `npm run build` | `npm run prisma:generate && tsc && tsc-alias` | Builds production bundle with alias paths |
| `npm start` | `npm run prisma:deploy && node dist/server.js` | Runs production server |
| `npm test` | `vitest` | Runs interactive test runner |
| `npm test -- --run` | `vitest run` | Runs all 49+ unit and integration test suites |
| `npm run typecheck` | `tsc --noEmit` | Strict TypeScript type validation |
| `npm run ci:verify` | Full build & test pipeline | Complete verification pipeline for CI/CD |

---

## 📖 API & Interactive Documentation

Once the server is running, explore the interactive documentation interfaces:

* **Swagger UI (REST Documentation)**: [http://localhost:3000/docs](http://localhost:3000/docs)
* **GraphQL Playground (Yoga API)**: [http://localhost:3000/graphql](http://localhost:3000/graphql)
* **Notifications & FCM Guide**: [src/modules/notifications/README.md](file:///e:/e-com/server/src/modules/notifications/README.md)
* **Background Jobs API Overview**: [src/jobs/ADMIN_BACKGROUND_JOBS.README.md](file:///e:/e-com/server/src/jobs/ADMIN_BACKGROUND_JOBS.README.md)
* **Real-Time WebSockets Guide**: [src/sockets/SOCKETS.md](file:///e:/e-com/server/src/sockets/SOCKETS.md)