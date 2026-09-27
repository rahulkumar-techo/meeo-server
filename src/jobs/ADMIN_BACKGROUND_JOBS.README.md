# Background Jobs & Worker Nodes Observability - Admin Operations Guide

> **Base Route**: `/api/v1/jobs`  
> **Route File**: [`src/modules/jobs/routes/job.route.ts`](file:///e:/e-com/server/src/modules/jobs/routes/job.route.ts)  
> **Controller**: [`src/modules/jobs/controller/job.controller.ts`](file:///e:/e-com/server/src/modules/jobs/controller/job.controller.ts)  
> **Services**: [`src/modules/jobs/services/`](file:///e:/e-com/server/src/modules/jobs/services/)  
> **Queue Engine**: [`src/lib/queue.ts`](file:///e:/e-com/server/src/lib/queue.ts) (BullMQ + Redis)  
> **Target Audience**: Platform Operations, SREs, DevOps Engineers, Admin Dashboard Engineers

---

## Table of Contents

1. [Observability & Telemetry Architecture](#observability--telemetry-architecture)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Worker Nodes Health & Pod Utilization](#worker-nodes-health--pod-utilization)
4. [Queue Categories & Filtering Model](#queue-categories--filtering-model)
5. [Interactive Jobs Table Specification](#interactive-jobs-table-specification)
6. [Admin Endpoints Summary](#admin-endpoints-summary)
7. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. Background Jobs Overview & Throughput KPIs (`GET /overview`)](#1-background-jobs-overview--throughput-kpis-get-overview)
   - [2. Worker Nodes Health & Utilization Telemetry (`GET /workers`)](#2-worker-nodes-health--utilization-telemetry-get-workers)
   - [3. List Background Jobs with Queue Filters (`GET /`)](#3-list-background-jobs-with-queue-filters-get-)
   - [4. Inspect Job Details & Trace Logs (`GET /:id`)](#4-inspect-job-details--trace-logs-get-id)
   - [5. Retry Failed or Dead-Lettered Job (`POST /:id/retry`)](#5-retry-failed-or-dead-lettered-job-post-idretry)
   - [6. Cancel / Discard Job (`POST /:id/cancel`)](#6-cancel--discard-job-post-idcancel)
   - [7. Execute Bulk Queue Actions (`POST /bulk-action`)](#7-execute-bulk-queue-actions-post-bulk-action)
8. [Dead-Letter Queue (DLQ) & Failure Remediation](#dead-letter-queue-dlq--failure-remediation)
9. [Operational Status Codes Reference](#operational-status-codes-reference)

---

## Observability & Telemetry Architecture

```
                      ┌─────────────────────────────────┐
                      │    Admin Dashboard / Jobs UI    │
                      └───────────────┬─────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
      GET /overview             GET /workers               GET /?filter=...
    (Throughput & DLQ)       (Node Pod CPU/RAM)           (Jobs Table Rows)
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                      ┌───────────────▼─────────────────┐
                      │  JobOverview & JobList Services │
                      └───────────────┬─────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│     PostgreSQL Outbox     │                   │       BullMQ Redis        │
│   (State, Retries, Logs)  │                   │ (Live Queues & In-Flight) │
└───────────────────────────┘                   └───────────────────────────┘
```

---

## Admin Permissions & Security Matrix

All background job endpoints require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the permission:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.SYSTEM_MANAGE` (`system:manage`) | Infrastructure & Jobs | View live worker pod CPU/RAM, query active in-flight jobs, retry failed jobs, cancel pending jobs, execute bulk purge/pause actions |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted execution across all background job monitoring and lifecycle management APIs |

---

## Worker Nodes Health & Pod Utilization

The `/api/v1/jobs/workers` endpoint reports live health and resource consumption per node and pod:

- **Node / Pod Identification**: `nodeId`, `podName` (e.g. `worker-pod-az1-7f9b8c-1`), `hostname`.
- **Health Status**: `HEALTHY`, `DEGRADED` (if memory > 90%), `OFFLINE`.
- **Resource Utilization**:
  - CPU usage % across available cores.
  - Memory: RSS, Heap Used, Heap Total, System Total, Free MB, and % Utilization.
- **Concurrency & Load**: Max concurrency limit, active worker thread count, and active job count.
- **Uptime & Heartbeat**: Precise uptime seconds, human-readable format (`12d 4h 15m 32s`), and ISO timestamp.

---

## Queue Categories & Filtering Model

The UI provides standard tab filters across designated functional queues:

| Filter Identifier | Label in UI | Underlying Queue & Event Scope |
|---|---|---|
| `ALL` | **All Queues** | Aggregated view across all platform queues |
| `CRITICAL_CHECKOUTS` | **Critical Checkouts** | `domain-events` for `ORDER_CREATED`, `ORDER_CONFIRMED`, `PAYMENT_SUCCEEDED` |
| `ORDER_FULFILLMENT_SYNC` | **Order Fulfillment Sync** | `order-fulfillment-sync` for `ORDER_SHIPPED`, `ORDER_DELIVERED` tracking sync |
| `MARKETING_EMAIL_BATCH` | **Marketing Email Batch** | `marketing-email-batch` for `PROMOTION`, `LOW_STOCK`, broadcast campaigns |
| `DEAD_LETTER_TRIGGER` | **Dead Letter Trigger** | `dead-letter-events` containing unrecoverable or max-attempt exhausted jobs |

---

## Interactive Jobs Table Specification

Each row in the jobs table provides the exact schema required for administrative control:

| Column Header | Field Name | Type | Example Value | Description |
|---|---|---|---|---|
| **Status** | `status` | `Badge` | `ACTIVE`, `WAITING`, `COMPLETED`, `FAILED`, `DELAYED`, `DEAD_LETTER` | Execution state |
| **Job ID** | `jobId` | `string` | `outbox-7f9b8c-1122-3344` | Unique job UUID |
| **Handler** | `handler` | `string` | `orderEventsConsumer` | Assigned consumer handler |
| **Queue** | `queue` | `string` | `domain-events` | Target queue name |
| **Worker** | `worker` | `string` | `worker-pod-az1-21840` | Worker node/pod executing the job |
| **Run Time** | `runtime` | `string` | `48 ms` | Elapsed execution duration |
| **Attempt** | `attempt` | `string` | `1/3`, `3/10` | Current attempt vs max limit |
| **Actions** | `actions` | `Buttons` | `[Retry]`, `[Cancel]`, `[Inspect]` | Available interactive operations |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/jobs/overview` | `system:manage` | Active in-flight count, throttled jobs, latency (p50/p95), DLQ depth |
| `GET` | `/api/v1/jobs/workers` | `system:manage` | Worker pods, CPU/RAM utilization %, active concurrency, heartbeat |
| `GET` | `/api/v1/jobs` | `system:manage` | Filterable and paginated jobs list for the table view |
| `GET` | `/api/v1/jobs/:id` | `system:manage` | Deep inspection of job payload, error stack trace, and execution trace |
| `POST` | `/api/v1/jobs/:id/retry` | `system:manage` | Retry a failed or dead-lettered job |
| `POST` | `/api/v1/jobs/:id/cancel` | `system:manage` | Discard an active or pending job |
| `POST` | `/api/v1/jobs/bulk-action` | `system:manage` | Bulk operations: `RETRY_ALL_FAILED`, `PURGE_DEAD_LETTER`, `PAUSE_QUEUES`, `RESUME_QUEUES` |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. Background Jobs Overview & Throughput KPIs (`GET /overview`)

Returns real-time KPIs on in-flight jobs, throughput, latencies, and queue health.

- **Method**: `GET`
- **URL**: `/api/v1/jobs/overview`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "summary": {
      "activeJobsInFlight": 14,
      "throttledJobs": 2,
      "jobsProcessedTotal": 18450,
      "jobsSucceeded": 18442,
      "jobsFailed": 8,
      "successRatePercent": 99.96,
      "averageExecutionLatencyMs": 42.5,
      "p95ExecutionLatencyMs": 128.0,
      "deadLetterQueueDepth": 3,
      "deadLetterTriggered": true
    },
    "workerNodes": {
      "totalNodes": 1,
      "healthyNodes": 1,
      "degradedNodes": 0,
      "totalActiveConcurrency": 10
    },
    "queues": [
      {
        "name": "domain-events",
        "category": "CRITICAL_CHECKOUTS",
        "waiting": 2,
        "active": 1,
        "completed": 12400,
        "failed": 0,
        "delayed": 0,
        "status": "HEALTHY"
      },
      {
        "name": "order-fulfillment-sync",
        "category": "ORDER_FULFILLMENT_SYNC",
        "waiting": 1,
        "active": 0,
        "completed": 4200,
        "failed": 0,
        "delayed": 0,
        "status": "HEALTHY"
      },
      {
        "name": "marketing-email-batch",
        "category": "MARKETING_EMAIL_BATCH",
        "waiting": 0,
        "active": 0,
        "completed": 1842,
        "failed": 0,
        "delayed": 2,
        "status": "HEALTHY"
      },
      {
        "name": "dead-letter-events",
        "category": "DEAD_LETTER_TRIGGER",
        "waiting": 3,
        "active": 0,
        "completed": 0,
        "failed": 0,
        "delayed": 0,
        "status": "CRITICAL"
      }
    ],
    "timestamp": "2026-09-08T14:40:00.000Z"
  }
}
```

---

### 2. Worker Nodes Health & Utilization Telemetry (`GET /workers`)

Returns CPU, memory, uptime, and concurrency telemetry for each worker pod.

- **Method**: `GET`
- **URL**: `/api/v1/jobs/workers`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": [
    {
      "nodeId": "node-worker-prod-az1-01",
      "podName": "worker-pod-az1-21840",
      "hostname": "worker-prod-az1-01",
      "status": "HEALTHY",
      "cpuUtilizationPercent": 18,
      "memoryUtilization": {
        "rssMb": 142.5,
        "heapUsedMb": 64.2,
        "heapTotalMb": 98.4,
        "systemTotalMb": 16384.0,
        "systemFreeMb": 8192.0,
        "percentUsed": 50.0
      },
      "concurrency": {
        "limit": 10,
        "activeWorkers": 1,
        "activeJobs": 2
      },
      "uptimeSeconds": 86400,
      "uptimeHuman": "1d 0h 0m 0s",
      "lastHeartbeat": "2026-09-08T14:40:00.000Z"
    }
  ]
}
```

---

### 3. List Background Jobs with Queue Filters (`GET /`)

Lists paginated jobs with category filter (`ALL`, `CRITICAL_CHECKOUTS`, `ORDER_FULFILLMENT_SYNC`, `MARKETING_EMAIL_BATCH`, `DEAD_LETTER_TRIGGER`), status filter, search, and pagination.

- **Method**: `GET`
- **URL**: `/api/v1/jobs?filter=CRITICAL_CHECKOUTS&status=ACTIVE&page=1&limit=20`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "outbox-11111111-2222-3333-4444-555555555555",
        "jobId": "outbox-11111111-2222-3333-4444-555555555555",
        "status": "COMPLETED",
        "handler": "orderEventsConsumer",
        "queue": "domain-events",
        "category": "CRITICAL_CHECKOUTS",
        "worker": "worker-pod-az1-21840",
        "runtime": "48 ms",
        "runtimeMs": 48,
        "attempt": "1/10",
        "attemptsCount": 1,
        "maxAttempts": 10,
        "payloadSummary": "{\"orderId\":\"ord-2222\",\"orderNumber\":\"ORD-1001\"}",
        "failedReason": null,
        "createdAt": "2026-09-08T14:30:00.000Z",
        "processedAt": "2026-09-08T14:30:00.048Z",
        "actions": ["INSPECT"]
      },
      {
        "id": "outbox-99999999-8888-7777-6666-555544443333",
        "jobId": "outbox-99999999-8888-7777-6666-555544443333",
        "status": "DEAD_LETTER",
        "handler": "notificationConsumer",
        "queue": "dead-letter-events",
        "category": "DEAD_LETTER_TRIGGER",
        "worker": "worker-pod-az1-21840",
        "runtime": "-",
        "runtimeMs": 0,
        "attempt": "10/10",
        "attemptsCount": 10,
        "maxAttempts": 10,
        "payloadSummary": "{\"recipientEmail\":\"invalid-email-format\"}",
        "failedReason": "SMTP error: 501 5.1.3 Bad recipient address syntax",
        "createdAt": "2026-09-08T13:00:00.000Z",
        "processedAt": null,
        "actions": ["RETRY", "CANCEL", "INSPECT"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

---

### 4. Inspect Job Details & Trace Logs (`GET /:id`)

Retrieves full JSON payload, error traces, and consumer execution history for a job.

- **Method**: `GET`
- **URL**: `/api/v1/jobs/:id`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "jobId": "outbox-99999999-8888-7777-6666-555544443333",
    "eventType": "ORDER_CONFIRMED",
    "aggregateType": "Order",
    "aggregateId": "ord-22222222-3333-4444-5555-666666666666",
    "status": "FAILED",
    "payload": {
      "orderId": "ord-22222222-3333-4444-5555-666666666666",
      "orderNumber": "ORD-20260908-1001",
      "customerEmail": "invalid-email-format"
    },
    "attempts": 10,
    "maxAttempts": 10,
    "lastError": "SMTP error: 501 5.1.3 Bad recipient address syntax",
    "createdAt": "2026-09-08T13:00:00.000Z",
    "publishedAt": null,
    "consumerLogs": [
      {
        "id": "proc-1",
        "consumerName": "notificationConsumer",
        "status": "FAILED",
        "lastError": "SMTP error: 501 5.1.3 Bad recipient address syntax",
        "processedAt": "2026-09-08T13:05:00.000Z"
      }
    ]
  }
}
```

---

### 5. Retry Failed or Dead-Lettered Job (`POST /:id/retry`)

Resets attempts to 0 and immediately enqueues the job into BullMQ for execution.

- **Method**: `POST`
- **URL**: `/api/v1/jobs/:id/retry`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Job reset and enqueued for immediate execution",
  "data": {
    "jobId": "outbox-99999999-8888-7777-6666-555544443333",
    "status": "WAITING",
    "message": "Job reset and enqueued for immediate execution",
    "retriedAt": "2026-09-08T14:45:00.000Z"
  }
}
```

---

### 6. Cancel / Discard Job (`POST /:id/cancel`)

Cancels an active or waiting job, marking it as discarded.

- **Method**: `POST`
- **URL**: `/api/v1/jobs/:id/cancel`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Job cancelled successfully",
  "data": {
    "jobId": "outbox-99999999-8888-7777-6666-555544443333",
    "status": "CANCELLED",
    "message": "Job cancelled successfully"
  }
}
```

---

### 7. Execute Bulk Queue Actions (`POST /bulk-action`)

Executes bulk actions across queues: `RETRY_ALL_FAILED`, `PURGE_DEAD_LETTER`, `PAUSE_QUEUES`, `RESUME_QUEUES`.

- **Method**: `POST`
- **URL**: `/api/v1/jobs/bulk-action`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Request Body
```json
{
  "action": "RETRY_ALL_FAILED"
}
```

#### Scenarios

##### Scenario 7.A: Success (`200 OK`)
```json
{
  "status": "success",
  "message": "Successfully re-queued 8 failed jobs",
  "data": {
    "action": "RETRY_ALL_FAILED",
    "affectedCount": 8,
    "message": "Successfully re-queued 8 failed jobs"
  }
}
```

---

## Dead-Letter Queue (DLQ) & Failure Remediation

When dead-letter jobs accumulate (`deadLetterQueueDepth > 0`):
1. Navigate to the **Dead Letter Trigger** tab in the dashboard.
2. Click **Inspect** to review the failed payload and stack trace.
3. Once the root cause (e.g., downstream third-party service timeout or configuration bug) is resolved:
   - Click **Retry** on individual jobs, or
   - Click **Retry All Failed** in the bulk actions dropdown.
4. If invalid/poison pill jobs should be dropped, click **Purge Dead Letter Queue**.

---

## Operational Status Codes Reference

| HTTP Status | Error Type | Cause / Recommended Action |
|---|---|---|
| `200 OK` | `SUCCESS` | Telemetry retrieved, job retried/cancelled, bulk action completed |
| `400 Bad Request` | `INVALID_JOB_STATE` | Attempting to retry an already completed job |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing Bearer token |
| `403 Forbidden` | `FORBIDDEN` | Missing `system:manage` permission |
| `404 Not Found` | `JOB_NOT_FOUND` | Job UUID not found |
