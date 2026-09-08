# Platform System Settings & Governance - Admin Operations Guide

> **Base Route**: `/api/v1/settings`  
> **Route File**: [`src/modules/settings/routes/setting.route.ts`](file:///e:/e-com/server/src/modules/settings/routes/setting.route.ts)  
> **Controller**: [`src/modules/settings/controller/setting.controller.ts`](file:///e:/e-com/server/src/modules/settings/controller/setting.controller.ts)  
> **Service**: [`src/modules/settings/services/setting.service.ts`](file:///e:/e-com/server/src/modules/settings/services/setting.service.ts)  
> **Validation Schemas**: [`src/modules/settings/validations/setting.validation.ts`](file:///e:/e-com/server/src/modules/settings/validations/setting.validation.ts)  
> **Target Audience**: Chief Technology Officers (CTO), Platform Administrators, Security Officers, Finance Operations

---

## Table of Contents

1. [Platform Governance & Settings Architecture](#platform-governance--settings-architecture)
2. [Configuration Tier Breakdown](#configuration-tier-breakdown)
   - [Tier 1 — Core Platform, Brand & Communication](#tier-1--core-platform-brand--communication)
   - [Tier 2 — Financial Rules & Settlement Policies](#tier-2--financial-rules--settlement-policies)
   - [Tier 3 — Advanced, Security & Emergency Controls](#tier-3--advanced-security--emergency-controls)
3. [Operational Modes & Protective Toggles](#operational-modes--protective-toggles)
4. [Dynamic Rate Limiting Architecture](#dynamic-rate-limiting-architecture)
5. [Feature Flags & Canary Percentage Rollout Engine](#feature-flags--canary-percentage-rollout-engine)
6. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
7. [Admin Endpoints Summary](#admin-endpoints-summary)
8. [Endpoint Specifications & Scenarios](#endpoint-specifications--scenarios)
   - [1. Retrieve Full System Settings (`GET /`)](#1-retrieve-full-system-settings-get-)
   - [2. Update System Settings (`PUT /`)](#2-update-system-settings-put-)
   - [3. Toggle Emergency Kill Switch (`POST /emergency-kill-switch`)](#3-toggle-emergency-kill-switch-post-emergency-kill-switch)
9. [Emergency Response & Kill Switch Runbook](#emergency-response--kill-switch-runbook)
10. [Audit Logging & Compliance Invariants](#audit-logging--compliance-invariants)

---

## Platform Governance & Settings Architecture

```
┌────────────────────────────────────────────────────────┐
│            Admin Dashboard / System Settings           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          SettingService (In-Memory Hot Cache)          │
│                                                        │
│  • Sub-millisecond reads for high-throughput traffic   │
│  • Zod schema validation on every write                │
│  • Automatic AuditLog emission on state modifications  │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Tier 1: Brand │   │Tier 2: Finance│   │Tier 3: Security│
│ & Operations  │   │& Settlements  │   │& Kill Switch  │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

## Configuration Tier Breakdown

### Tier 1 — Core Platform, Brand & Communication

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `platformBrandName` | `string` | `"E-Commerce Platform"` | Public brand name rendered across customer storefront, emails, and invoices |
| `publicDomainUrl` | `string URL`| `"https://store.example.com"` | Canonical public URL used for deep links, return URLs, and email CTAs |
| `supportEmail` | `email` | `"support@example.com"` | Customer support contact address in email headers |
| `operationsEmail` | `email` | `"ops@example.com"` | Internal operations email for low-stock and fulfillment alerts |
| `securityEmail` | `email` | `"security@example.com"` | Escalation email for security incident alerts |
| `requireAdmin2FA` | `boolean` | `false` | Enforces mandatory Multi-Factor Authentication (MFA) for administrative logins |
| `defaultCurrency` | `string` | `"USD"` | Platform base currency for catalog pricing and financial ledgers (`USD`, `EUR`, `INR`, `GBP`) |
| `timezone` | `string` | `"UTC"` | Reporting and business day boundary timezone (e.g. `UTC`, `America/New_York`) |

---

### Tier 2 — Financial Rules & Settlement Policies

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `settlementFrequency` | `enum` | `"WEEKLY"` | Merchant and vendor payout cycle: `"DAILY"`, `"WEEKLY"`, `"BI_WEEKLY"`, `"MONTHLY"` |
| `settlementDelayDays` | `integer` | `2` | Holding buffer in days before funds become eligible for payout (e.g. T+2) |
| `minimumPayoutAmount` | `number` | `50.00` | Minimum accrued balance required to trigger an automated payout disbursement |
| `reservePercentage` | `number` | `5.0` | Percentage of gross sales held in rolling reserve to cover potential chargebacks |
| `refundApprovalThreshold`| `number` | `500.00` | Dollar amount threshold above which refunds require dual supervisor approval |
| `automatedPayouts` | `boolean` | `true` | When true, automated worker schedules disburse payouts upon threshold attainment |

---

### Tier 3 — Advanced, Security & Emergency Controls

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `allowedMaintenanceIps` | `array` | `[]` | Whitelisted IPv4/IPv6 addresses permitted to bypass `maintenanceMode` |
| `emergencyControls` | `object` | `{ killSwitchActive: false }` | Immediate platform freeze containing status, message, and freeze timestamp |
| `dataRetentionDays` | `integer` | `365` | Retention window for historical audit logs and notification feeds before archival |

---

## Operational Modes & Protective Toggles

- **`maintenanceMode`**: Blocks public storefront traffic with a `503 Service Unavailable` page. Whitelisted IP addresses in `allowedMaintenanceIps` maintain full access for staging deployments and testing.
- **`readOnlyMode`**: Rejects all database mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) with a `423 Locked` error, while preserving catalog browsing and order viewing during database migrations.
- **`disableCheckout`**: Pauses new cart checkout sessions (e.g., during physical warehouse inventory stocktaking).
- **`disablePayments`**: Blocks payment intent initialization with external gateways (Stripe/Razorpay) while allowing cash-on-delivery or draft orders.

---

## Dynamic Rate Limiting Architecture

| Rate Limit Key | Scope | Default Limit | Purpose |
|---|---|---|---|
| `globalApiRateLimit` | Per Client IP | `100 req / min` | Protects API servers from DDoS and general traffic spikes |
| `loginRateLimit` | Per IP / Email | `5 req / min` | Mitigates brute-force credential stuffing and password guessing |
| `checkoutRateLimit` | Per User / IP | `10 req / min` | Prevents automated card testing bots and coupon brute-forcing |

---

## Feature Flags & Canary Percentage Rollout Engine

The system supports both binary toggles and canary percentage rollouts:

```json
{
  "featureFlags": {
    "enableReviews": true,
    "enableCoupons": true,
    "enableWishlists": true,
    "enableGuestCheckout": true,
    "enableExpressPay": true,
    "enableAiSearch": false
  },
  "percentageFeatureRollout": {
    "newCheckoutFunnel": 100,
    "aiProductRecommendations": 25
  }
}
```

- **Deterministic User Hashing**: For canary rollouts (e.g. `aiProductRecommendations: 25`), the algorithm hashes the `userId` into a consistent bucket (0–99), ensuring a given customer always experiences a uniform interface.

---

## Admin Permissions & Security Matrix

All administrative operations on system settings require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the permission:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.SYSTEM_MANAGE` (`system:manage`) | Platform Governance | View full system settings across all 3 tiers, update brand details, operational toggles, financial rules, feature flags, and toggle the emergency kill switch |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted access across all platform governance and emergency controls |

---

## Admin Endpoints Summary

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/settings` | `system:manage` | Get full system configuration across all 3 tiers |
| `PUT` | `/api/v1/settings` | `system:manage` | Update system settings with schema validation and audit logging |
| `POST` | `/api/v1/settings/emergency-kill-switch` | `system:manage` | Immediately engage or disengage the platform emergency kill switch |

---

## Endpoint Specifications & Scenarios

---

### 1. Retrieve Full System Settings (`GET /`)

- **Method**: `GET`
- **URL**: `/api/v1/settings`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Response (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "data": {
    "platformBrandName": "Acme Commerce Platform",
    "publicDomainUrl": "https://store.example.com",
    "supportEmail": "support@example.com",
    "operationsEmail": "ops@example.com",
    "securityEmail": "security@example.com",
    "requireAdmin2FA": true,
    "defaultCurrency": "USD",
    "timezone": "UTC",
    "maintenanceMode": false,
    "readOnlyMode": false,
    "disableCheckout": false,
    "disablePayments": false,
    "globalApiRateLimit": 100,
    "loginRateLimit": 5,
    "checkoutRateLimit": 10,
    "featureFlags": {
      "enableReviews": true,
      "enableCoupons": true,
      "enableWishlists": true,
      "enableGuestCheckout": true,
      "enableExpressPay": true,
      "enableAiSearch": false
    },
    "percentageFeatureRollout": {
      "newCheckoutFunnel": 100,
      "aiProductRecommendations": 25
    },
    "settlementFrequency": "WEEKLY",
    "settlementDelayDays": 2,
    "minimumPayoutAmount": 50.00,
    "reservePercentage": 5.0,
    "refundApprovalThreshold": 500.00,
    "automatedPayouts": true,
    "allowedMaintenanceIps": ["192.0.2.1", "198.51.100.24"],
    "emergencyControls": {
      "killSwitchActive": false,
      "emergencyMessage": null,
      "frozenAt": null
    },
    "dataRetentionDays": 365
  }
}
```

---

### 2. Update System Settings (`PUT /`)

Updates one or more settings fields with atomic in-memory cache synchronization and immutable audit trail emission.

- **Method**: `PUT`
- **URL**: `/api/v1/settings`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Request Body Example
```json
{
  "platformBrandName": "Nexus Global Commerce",
  "settlementFrequency": "DAILY",
  "refundApprovalThreshold": 250.00,
  "featureFlags": {
    "enableReviews": true,
    "enableCoupons": true,
    "enableWishlists": true,
    "enableGuestCheckout": true,
    "enableExpressPay": true,
    "enableAiSearch": true
  }
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "message": "System settings updated successfully",
  "data": {
    "platformBrandName": "Nexus Global Commerce",
    "settlementFrequency": "DAILY",
    "refundApprovalThreshold": 250.00,
    "featureFlags": {
      "enableReviews": true,
      "enableCoupons": true,
      "enableWishlists": true,
      "enableGuestCheckout": true,
      "enableExpressPay": true,
      "enableAiSearch": true
    }
  }
}
```

---

### 3. Toggle Emergency Kill Switch (`POST /emergency-kill-switch`)

Instantly locks all financial and checkout operations across the platform during critical outages or security incidents.

- **Method**: `POST`
- **URL**: `/api/v1/settings/emergency-kill-switch`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Request Body
```json
{
  "killSwitchActive": true,
  "emergencyMessage": "Critical payment gateway maintenance in progress. Orders are temporarily paused."
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "message": "Emergency kill switch engaged: platform frozen",
  "data": {
    "maintenanceMode": true,
    "disableCheckout": true,
    "disablePayments": true,
    "emergencyControls": {
      "killSwitchActive": true,
      "emergencyMessage": "Critical payment gateway maintenance in progress. Orders are temporarily paused.",
      "frozenAt": "2026-09-08T15:10:00.000Z"
    }
  }
}
```

---

## Emergency Response & Kill Switch Runbook

When a critical vulnerability or payment gateway outage occurs:
1. **Engage Kill Switch**:
   - Send `POST /api/v1/settings/emergency-kill-switch` with `killSwitchActive: true`.
   - The platform immediately freezes checkouts, disables payment intents, and enters maintenance mode.
2. **Perform Remediation**:
   - Authorized personnel access the API using IP addresses listed in `allowedMaintenanceIps`.
3. **Disengage Kill Switch**:
   - Send `POST /api/v1/settings/emergency-kill-switch` with `killSwitchActive: false`.
   - The platform resumes normal operation and logs an `EMERGENCY_KILL_SWITCH_DISENGAGED` audit record.

---

## Audit Logging & Compliance Invariants

Every modification to platform settings automatically writes an entry to `AuditLog`:
- **Action Names**: `SYSTEM_SETTINGS_UPDATED`, `EMERGENCY_KILL_SWITCH_ENGAGED`, `EMERGENCY_KILL_SWITCH_DISENGAGED`.
- **Captured Fields**: Complete `oldValue` snapshot, `newValue` snapshot, acting administrator `actorId`, client `ipAddress`, and browser `userAgent`.
