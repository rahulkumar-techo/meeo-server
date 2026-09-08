# System Security & Compliance Audit Logs - Admin Guide

> **Base Route**: `/api/v1/admin/audit-logs`  
> **Route File**: [`src/modules/audit/routes/auditLog.route.ts`](file:///e:/e-com/server/src/modules/audit/routes/auditLog.route.ts)  
> **Controller**: [`src/modules/audit/controller/auditLog.controller.ts`](file:///e:/e-com/server/src/modules/audit/controller/auditLog.controller.ts)  
> **Service**: [`src/modules/audit/services/auditLog.service.ts`](file:///e:/e-com/server/src/modules/audit/services/auditLog.service.ts)  
> **Validation Schemas**: [`src/modules/audit/validations/auditLog.validation.ts`](file:///e:/e-com/server/src/modules/audit/validations/auditLog.validation.ts)  
> **Masking Engine**: [`src/common/security/masking.ts`](file:///e:/e-com/server/src/common/security/masking.ts)  
> **Target Audience**: Security Officers, Compliance Auditors, System Administrators, DevOps Engineers

---

## Table of Contents

1. [Audit Logging Architecture & Compliance](#audit-logging-architecture--compliance)
2. [Automatic Sensitive Data Masking & PII Redaction](#automatic-sensitive-data-masking--pii-redaction)
3. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
4. [Audit Trail Endpoints Summary](#audit-trail-endpoints-summary)
5. [Endpoint Specifications & Forensic Scenarios](#endpoint-specifications--forensic-scenarios)
   - [1. Query System Audit Logs (`GET /`)](#1-query-system-audit-logs-get-)
   - [2. Inspect State Diffs & Log Record Details (`GET /:id`)](#2-inspect-state-diffs--log-record-details-get-id)
6. [Supported Entity Types & Action Taxonomy](#supported-entity-types--action-taxonomy)
7. [Compliance & Security Runbook](#compliance--security-runbook)
8. [Error Codes & Diagnostics](#error-codes--diagnostics)

---

## Audit Logging Architecture & Compliance

The Audit Log system provides an **immutable, append-only security log** recording every administrative state mutation, financial operation, role assignment, and inventory adjustment.

```
┌────────────────────────────────────────────────────────┐
│             Admin Operation / HTTP Request             │
│            (e.g., Update Role / Issue Refund)          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 AuditLogService.recordLog()            │
│                                                        │
│  1. Capture Actor (userId, email, role)                │
│  2. Capture Network (client IP, User-Agent)            │
│  3. Capture State Diff (oldValue vs newValue)          │
│  4. Apply Sensitive Data Masking (PII / Passwords)     │
│  5. Non-Blocking Database Insertion                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            PostgreSQL Immutable "AuditLog"             │
│          (Indexed by entityType, actorId, date)        │
└────────────────────────────────────────────────────────┘
```

### Key Compliance Invariants

- **Non-Blocking Execution**: Audit logging failures will never abort or rollback primary business transactions.
- **Append-Only Immutability**: No `UPDATE` or `DELETE` endpoints exist on the audit log router.
- **Forensic Context**: Every entry links the acting user ID (`actorId`), client IP address (`ipAddress`), browser `userAgent`, and exact timestamp.

---

## Automatic Sensitive Data Masking & PII Redaction

To maintain PCI-DSS, SOC 2, and GDPR compliance, [`maskSensitiveData()`](file:///e:/e-com/server/src/common/security/masking.ts) automatically sanitizes JSON state diffs before writing to the database:

| Data Type | Field Names Detected | Redaction Policy | Example Output |
|---|---|---|---|
| **Passwords / Hashes** | `password`, `passwordHash`, `token`, `secret` | Masked completely | `"[REDACTED]"` |
| **Credit / Debit Cards**| `cardNumber`, `pan`, `card_number` | Masked with last 4 digits | `"****-****-****-1234"` |
| **Email Addresses** | `email`, `recipientEmail` | Partially masked | `"j***e@example.com"` |
| **Phone Numbers** | `phone`, `mobile` | Partially masked | `"+1-***-***-8899"` |

---

## Admin Permissions & Security Matrix

All audit log endpoints require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the permission:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.AUDIT_LOG_READ` (`audit:read`) | Security Read-Only | Search forensic audit trails, filter by entity type, actor ID, date range, and inspect state diffs |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted access across all security audit and compliance records |

---

## Audit Trail Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/audit-logs` | `audit:read` | Search and paginate system audit logs with multi-attribute filters |
| `GET` | `/api/v1/admin/audit-logs/:id` | `audit:read` | Inspect complete before/after state diffs and forensic context for a specific log record |

---

## Endpoint Specifications & Forensic Scenarios

---

### 1. Query System Audit Logs (`GET /`)

Retrieves a paginated list of audit records with entity type, action, actor ID, and date range filters.

- **Method**: `GET`
- **URL**: `/api/v1/admin/audit-logs`
- **Permission**: `audit:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `entityType` | `string` | No | - | Filter by target entity (`Order`, `User`, `Role`, `Payment`, `Inventory`) |
| `entityId` | `string` | No | - | Filter by target entity UUID |
| `actorId` | `string` | No | - | Filter by the administrator who performed the action |
| `action` | `string` | No | - | Filter by action name (e.g. `UPDATE_ROLE`, `REFUND_ISSUED`) |
| `startDate` | `ISO 8601` | No | - | Start of timestamp window |
| `endDate` | `ISO 8601` | No | - | End of timestamp window |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "data": {
    "items": [
      {
        "id": "audit-11111111-2222-3333-4444-555555555555",
        "action": "UPDATE_USER_ROLE",
        "entityType": "User",
        "entityId": "usr-22222222-3333-4444-5555-666666666666",
        "oldValue": {
          "roles": ["CUSTOMER"]
        },
        "newValue": {
          "roles": ["CUSTOMER", "SUPPORT_ADMIN"]
        },
        "ipAddress": "192.0.2.45",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
        "createdAt": "2026-09-08T14:30:00.000Z",
        "actor": {
          "id": "usr-admin-1",
          "email": "superadmin@store.com",
          "name": "Sarah Connor"
        }
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
  "message": "Forbidden: Required permission 'audit:read' missing",
  "statusCode": 403
}
```

---

### 2. Inspect State Diffs & Log Record Details (`GET /:id`)

Retrieves the complete state diff payload, actor profile, and forensic network headers for a specific audit log record.

- **Method**: `GET`
- **URL**: `/api/v1/admin/audit-logs/:id`
- **Permission**: `audit:read` or `SUPER_ADMIN`

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "data": {
    "id": "audit-11111111-2222-3333-4444-555555555555",
    "action": "REFUND_ISSUED",
    "entityType": "Payment",
    "entityId": "pay-33333333-4444-5555-6666-777777777777",
    "oldValue": {
      "status": "SUCCESS",
      "refundedAmount": 0.00,
      "remainingRefundable": 126.64
    },
    "newValue": {
      "status": "PARTIALLY_REFUNDED",
      "refundedAmount": 50.00,
      "remainingRefundable": 76.64,
      "reason": "Customer returned 1 item"
    },
    "ipAddress": "198.51.100.12",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "createdAt": "2026-09-08T14:35:00.000Z",
    "actor": {
      "id": "usr-finance-1",
      "email": "finance@store.com",
      "name": "Alex Mercer"
    }
  }
}
```

##### Scenario 2.B: Error - Log Record Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Audit log record not found",
  "statusCode": 404
}
```

---

## Supported Entity Types & Action Taxonomy

| Entity Type | Typical Actions | Logged State Changes |
|---|---|---|
| **`User`** | `USER_SUSPENDED`, `USER_BLOCKED`, `UPDATE_USER_ROLE` | Status change, assigned roles, security tier |
| **`Role`** | `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Granted permission constants (`product:write`, etc.) |
| **`Payment`** | `PAYMENT_REFUNDED`, `PAYMENT_RECONCILED` | Refund amounts, gateway response IDs, ledger balances |
| **`Order`** | `ORDER_STATUS_UPDATED`, `ORDER_CANCELLED` | Order state (`PENDING` $\to$ `CONFIRMED` $\to$ `CANCELLED`) |
| **`Inventory`** | `STOCK_ADJUSTED`, `STOCK_RESTOCKED`, `THRESHOLD_CHANGED` | Previous available qty vs adjusted qty, reason |
| **`Coupon`** | `COUPON_CREATED`, `COUPON_DEACTIVATED`, `COUPON_UPDATED` | Discount values, expiry dates, usage caps |

---

## Compliance & Security Runbook

When auditing privileged actions or investigating security incidents:
1. **Filter by Actor**: Filter by `actorId` to view a timeline of all mutations performed by a compromised or departed employee account.
2. **Filter by Entity**: Filter by `entityType="Payment"` or `entityType="Order"` with the specific `entityId` to trace lifecycle changes and determine who authorized refunds or cancellations.
3. **Time-Bound Investigations**: Use `startDate` and `endDate` parameters to extract targeted compliance evidence for SOC 2 / ISO 27001 auditor verification.

---

## Error Codes & Diagnostics

| HTTP Status | Error Type | Cause / Recommended Action |
|---|---|---|
| `400 Bad Request` | `INVALID_PARAM` | Invalid UUID format in URL or query parameter |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing or expired JWT Bearer token |
| `403 Forbidden` | `FORBIDDEN` | Missing required `audit:read` permission |
| `404 Not Found` | `LOG_NOT_FOUND` | Audit log record does not exist |
