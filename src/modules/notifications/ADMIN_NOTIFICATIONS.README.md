# Notification & Communication Operations - Admin API Documentation

> **Base Route**: `/api/v1/notifications`  
> **Route File**: [`src/modules/notifications/routes/notification.route.ts`](file:///e:/e-com/server/src/modules/notifications/routes/notification.route.ts)  
> **Controller**: [`src/modules/notifications/controller/notification.controller.ts`](file:///e:/e-com/server/src/modules/notifications/controller/notification.controller.ts)  
> **Services**: [`src/modules/notifications/services/`](file:///e:/e-com/server/src/modules/notifications/services/)  
> **Validations**: [`src/modules/notifications/validations/notification.validation.ts`](file:///e:/e-com/server/src/modules/notifications/validations/notification.validation.ts)  
> **Templates**: [`src/modules/notifications/templates/notificationTemplates.ts`](file:///e:/e-com/server/src/modules/notifications/templates/notificationTemplates.ts)  
> **Target Audience**: System Administrators, Marketing Operations, Customer Support Teams, Communication Engineers

---

## Table of Contents

1. [Notification Engine Architecture](#notification-engine-architecture)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Multi-Channel Dispatch & Template Engine](#multi-channel-dispatch--template-engine)
4. [Admin Endpoints Summary](#admin-endpoints-summary)
5. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. Dispatch Targeted or Broadcast Notification (`POST /send`)](#1-dispatch-targeted-or-broadcast-notification-post-send)
   - [2. Retry Failed Notification Delivery (`POST /:id/retry`)](#2-retry-failed-notification-delivery-post-idretry)
6. [Supported Notification Templates & Placeholders](#supported-notification-templates--placeholders)
7. [Delivery Error Tracking & Self-Healing](#delivery-error-tracking--self-healing)
8. [Security & Error Codes Reference](#security--error-codes-reference)

---

## Notification Engine Architecture

```
                    ┌────────────────────────────────┐
                    │      Admin Dispatch / Event    │
                    │   POST /send  or Outbox Worker │
                    └───────────────┬────────────────┘
                                    │
                    ┌───────────────▼────────────────┐
                    │ NotificationDispatcherService  │
                    └───────────────┬────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
     Check User Prefs        Render Templates       Check Channel Status
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ EMAIL CHANNEL │           │ PUSH CHANNEL  │           │IN-APP CHANNEL │
│(Resend/SMTP)  │           │   (Firebase)  │           │ (DB In-App)   │
└───────┬───────┘           └───────┬───────┘           └───────┬───────┘
        │                           │                           │
        ▼                           ▼                           ▼
Notification Log            Notification Log            In-App Notification
(SENT / FAILED)             (SENT / FAILED)               (UNREAD State)
        │
        ▼
POST /:id/retry (Heals failed emails/push)
```

### Key Architectural Invariants

- **Multi-Channel Parallelism**: A single dispatch request can target one or all channels (`EMAIL`, `PUSH`, `IN_APP`) simultaneously.
- **Preference Guardrails**: The dispatcher automatically queries user channel opt-ins (`NotificationPreference`) before attempting delivery, preventing spam and maintaining regulatory compliance (CAN-SPAM / GDPR).
- **Delivery Logging & Retries**: Every outgoing message creates a persistent record with its `status` (`SENT`, `FAILED`), timestamp, delivery attempts count, and raw error message (`lastError`).

---

## Admin Permissions & Security Matrix

All administrative notification operations require an `Authorization: Bearer <token>` header containing `SUPER_ADMIN` role **OR** the specific permission constants:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.SYSTEM_MANAGE` (`system:manage`) | Operations & System | Dispatch manual/broadcast notifications across channels, retry failed deliveries |
| Role: `SUPER_ADMIN` | Full Control | Unrestricted execution across all notification engine endpoints |

---

## Multi-Channel Dispatch & Template Engine

### Supported Channels

| Channel | Identifier | Provider Driver | Typical Use Case |
|---|---|---|---|
| **Email** | `EMAIL` | Resend / Nodemailer / SMTP | Order invoices, password resets, payment receipts, shipping tracking links |
| **Push** | `PUSH` | Firebase Cloud Messaging (FCM) / Web Push | Flash sale announcements, urgent order status updates, delivery arrival alerts |
| **In-App** | `IN_APP` | PostgreSQL Persistent Feed | Notification bell badge, persistent customer inbox, order history alerts |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/api/v1/notifications/send` | `system:manage` | Dispatch custom or template-based notification across selected channels |
| `POST` | `/api/v1/notifications/:id/retry` | `system:manage` | Re-attempt delivery for a previously failed notification record |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. Dispatch Targeted or Broadcast Notification (`POST /send`)

Dispatches a custom or campaign notification to a specific user (by `userId`), a standalone email recipient (by `recipientEmail`), or multiple communication channels.

- **Method**: `POST`
- **URL**: `/api/v1/notifications/send`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `userId` | `UUID` | No | Valid user UUID | Target platform user ID (required for `IN_APP` and `PUSH`) |
| `recipientEmail` | `string` | No | Valid email address | Direct recipient email (used if targeting unauthenticated or external emails) |
| `type` | `string` | Yes | Min: 1 char | Notification event category (e.g. `PROMOTION`, `SECURITY_ALERT`, `CUSTOM`) |
| `title` | `string` | Yes | Min: 1 char | Notification subject line / push headline |
| `body` | `string` | Yes | Min: 1 char | Plain-text notification content |
| `channels` | `array` | Yes | `["EMAIL", "PUSH", "IN_APP"]` | Target delivery channels (at least 1 required) |
| `data` | `object` | No | Key-value pairs | Additional metadata, deep links, or template parameters |

#### Request Body Example (Targeted User Multi-Channel)
```json
{
  "userId": "usr-11111111-2222-3333-4444-555555555555",
  "type": "PROMOTION",
  "title": "Weekend Flash Sale - 30% Off Everything!",
  "body": "Use coupon code FLASH30 at checkout before Sunday midnight to get 30% off your entire order.",
  "channels": ["EMAIL", "PUSH", "IN_APP"],
  "data": {
    "couponCode": "FLASH30",
    "ctaUrl": "https://store.example.com/flash-sale"
  }
}
```

#### Scenarios

##### Scenario 1.A: Success - Multi-Channel Delivery (`200 OK`)
```json
{
  "status": "success",
  "message": "Notification dispatched successfully",
  "data": {
    "channelsDispatched": ["EMAIL", "PUSH", "IN_APP"],
    "results": [
      {
        "channel": "EMAIL",
        "success": true,
        "notificationId": "notif-11111111-2222-3333-4444-555555555555"
      },
      {
        "channel": "PUSH",
        "success": true
      },
      {
        "channel": "IN_APP",
        "success": true,
        "notificationId": "notif-22222222-3333-4444-5555-666666666666"
      }
    ]
  }
}
```

##### Scenario 1.B: Success - Standalone Email Dispatch (`200 OK`)
- **Request**:
```json
{
  "recipientEmail": "shopper@example.com",
  "type": "SECURITY_ALERT",
  "title": "Security Notice: Unusual Login Detected",
  "body": "We detected a login to your account from a new IP address: 192.0.2.1.",
  "channels": ["EMAIL"]
}
```
```json
{
  "status": "success",
  "message": "Notification dispatched successfully",
  "data": {
    "channelsDispatched": ["EMAIL"],
    "results": [
      {
        "channel": "EMAIL",
        "success": true,
        "notificationId": "notif-33333333-4444-5555-6666-777777777777"
      }
    ]
  }
}
```

##### Scenario 1.C: Error - Missing Permission (`403 Forbidden`)
```json
{
  "status": "error",
  "message": "Forbidden: Required permission 'system:manage' missing",
  "statusCode": 403
}
```

---

### 2. Retry Failed Notification Delivery (`POST /:id/retry`)

Retries a previously failed notification delivery (e.g. SMTP timeout or push connection error).

- **Method**: `POST`
- **URL**: `/api/v1/notifications/:id/retry`
- **Permission**: `system:manage` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Target failed notification UUID |

#### Scenarios

##### Scenario 2.A: Success - Delivery Succeeded on Retry (`200 OK`)
```json
{
  "status": "success",
  "message": "Notification retry processed",
  "data": {
    "id": "notif-11111111-2222-3333-4444-555555555555",
    "channel": "EMAIL",
    "status": "SENT",
    "attempts": 2,
    "sentAt": "2026-09-08T14:15:00.000Z",
    "lastError": null
  }
}
```

##### Scenario 2.B: Error - Notification Not Found (`404 Not Found`)
```json
{
  "status": "error",
  "message": "Notification not found",
  "statusCode": 404
}
```

##### Scenario 2.C: Error - Notification Already Sent (`400 Bad Request`)
```json
{
  "status": "error",
  "message": "Notification is already in \"SENT\" status and cannot be retried",
  "statusCode": 400
}
```

---

## Supported Notification Templates & Placeholders

The engine provides standardized HTML/Push templates in [`notificationTemplates.ts`](file:///e:/e-com/server/src/modules/notifications/templates/notificationTemplates.ts):

| Template Type | Category | Variables Supported |
|---|---|---|
| `ORDER_CONFIRMED` | `orderUpdates` | `{{customerName}}`, `{{orderNumber}}`, `{{currency}}`, `{{totalAmount}}` |
| `ORDER_SHIPPED` | `orderUpdates` | `{{customerName}}`, `{{orderNumber}}`, `{{carrier}}`, `{{trackingNumber}}`, `{{estimatedDelivery}}` |
| `ORDER_DELIVERED` | `orderUpdates` | `{{customerName}}`, `{{orderNumber}}` |
| `PAYMENT_SUCCESS` | `orderUpdates` | `{{customerName}}`, `{{orderNumber}}`, `{{currency}}`, `{{amount}}`, `{{provider}}`, `{{transactionId}}` |
| `PAYMENT_FAILED` | `orderUpdates` | `{{customerName}}`, `{{orderNumber}}`, `{{reason}}` |
| `LOW_STOCK` | `lowStockAlerts` | `{{productName}}`, `{{sku}}`, `{{remainingStock}}`, `{{threshold}}` |

---

## Delivery Error Tracking & Self-Healing

When third-party delivery providers experience temporary outages:
1. **Error Logging**: Detailed error stack traces or SMTP status codes are captured in `Notification.lastError`.
2. **Attempt Tracking**: `Notification.attempts` is incremented on each attempt.
3. **Manual / Automated Retries**: Operations can inspect failed records and trigger `POST /:id/retry` to safely re-dispatch once external gateways are restored.

---

## Security & Error Codes Reference

| HTTP Status | Error Type | Explanation |
|---|---|---|
| `200 OK` | `SUCCESS` | Notification dispatched or retry completed |
| `400 Bad Request` | `VALIDATION_ERROR` | Empty channel list, malformed email, or attempting to retry an already sent message |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing or expired bearer token |
| `403 Forbidden` | `FORBIDDEN` | Missing required `system:manage` permission |
| `404 Not Found` | `NOT_FOUND` | Notification UUID not found |
