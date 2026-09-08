# Reviews & Ratings Moderation - Admin API Documentation

> **Base Route**: `/api/v1/reviews`  
> **Route File**: [`src/modules/reviews/routes/review.route.ts`](file:///e:/e-com/server/src/modules/reviews/routes/review.route.ts)  
> **Controller**: [`src/modules/reviews/controller/review.controller.ts`](file:///e:/e-com/server/src/modules/reviews/controller/review.controller.ts)  
> **Moderation Service**: [`src/modules/reviews/services/reviewModeration.service.ts`](file:///e:/e-com/server/src/modules/reviews/services/reviewModeration.service.ts)  
> **Reports Service**: [`src/modules/reviews/services/reviewReport.service.ts`](file:///e:/e-com/server/src/modules/reviews/services/reviewReport.service.ts)  
> **Validations**: [`src/modules/reviews/validations/review.validation.ts`](file:///e:/e-com/server/src/modules/reviews/validations/review.validation.ts)  
> **Target Audience**: Admin Dashboard, Trust & Safety Moderation Teams, Content Quality Reviewers

---

## Table of Contents

1. [Moderation Architecture & Abuse Lifecycle](#moderation-architecture--abuse-lifecycle)
2. [Admin Permissions & Security Matrix](#admin-permissions--security-matrix)
3. [Admin Endpoints Summary](#admin-endpoints-summary)
4. [Admin Endpoint Specifications & Scenarios](#admin-endpoint-specifications--scenarios)
   - [1. List All Platform Reviews (`GET /admin/all`)](#1-list-all-platform-reviews-get-adminall)
   - [2. Pending Moderation Queue (`GET /admin/queue`)](#2-pending-moderation-queue-get-adminqueue)
   - [3. Moderate Single Review (`PATCH /admin/:id/moderate`)](#3-moderate-single-review-patch-adminidmoderate)
   - [4. Bulk Moderate Reviews (`POST /admin/bulk-moderate`)](#4-bulk-moderate-reviews-post-adminbulk-moderate)
   - [5. List Abuse & Spam Reports (`GET /admin/reports`)](#5-list-abuse--spam-reports-get-adminreports)
   - [6. Get Abuse Report Details (`GET /admin/reports/:id`)](#6-get-abuse-report-details-get-adminreportsid)
   - [7. Resolve Abuse Report & Action Review (`PATCH /admin/reports/:id/resolve`)](#7-resolve-abuse-report--action-review-patch-adminreportsidresolve)
   - [8. Delete Review (`DELETE /:id`)](#8-delete-review-delete-id)
5. [Public & Storefront Impact Reference](#public--storefront-impact-reference)
6. [Security & Error Codes Reference](#security--error-codes-reference)

---

## Moderation Architecture & Abuse Lifecycle

```
[Customer Submits Review] ──▶ Status: PENDING
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         │                                                     │
(Admin Approves)                                      (Admin Rejects)
         ▼                                                     ▼
Status: APPROVED                                      Status: REJECTED
(Visible on Product Page &                            (Hidden from Storefront)
 Updates Star Ratings)
```

```
[User Reports Review] ──▶ Abuse Status: PENDING
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  ACTIONED                DISMISSED                 REVIEWED
  • Reject Review         • False positive          • Kept under
  • Delete Review         • No violation              observation
```

- **Verified Purchase Badging**: The system automatically looks up confirmed order items matching the author's user ID and product ID.
- **Audit Trails**: Every moderation action records the `moderatedBy` admin ID, `moderatedAt` timestamp, and `moderationNote`.
- **Aggregated Ratings Recalculation**: Only reviews in `APPROVED` status are factored into average rating scores, verified counts, and star distributions (1 to 5 stars).

---

## Admin Permissions & Security Matrix

All admin review endpoints require an `Authorization: Bearer <token>` header belonging to a user with the `SUPER_ADMIN` role **OR** the specific granular permission constants:

| Permission Constant | Scope | Operations Authorized |
|---|---|---|
| `PERMISSIONS.REVIEW_READ` (`review:read`) | Read Only | View all reviews across statuses (`PENDING`, `APPROVED`, `REJECTED`) |
| `PERMISSIONS.REVIEW_MODERATE` (`review:moderate`) | Moderation & Reports | View moderation queue, approve/reject single reviews, bulk moderate, view abuse reports, resolve reports |
| `PERMISSIONS.REVIEW_DELETE` (`review:delete`) | Deletion | Hard-delete any review |
| Role: `SUPER_ADMIN` | Full System Control | Unrestricted access across all review moderation, deletion, and reporting endpoints |

---

## Admin Endpoints Summary

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/reviews/admin/all` | `review:read` | List all platform reviews with status, rating, and verified purchase filters |
| `GET` | `/api/v1/reviews/admin/queue` | `review:moderate` | Pending moderation queue (`status: PENDING`) with abuse report counts |
| `PATCH` | `/api/v1/reviews/admin/:id/moderate` | `review:moderate` | Moderate a single review (`APPROVED` or `REJECTED`) with audit note |
| `POST` | `/api/v1/reviews/admin/bulk-moderate` | `review:moderate` | Batch approve or reject up to 100 reviews simultaneously |
| `GET` | `/api/v1/reviews/admin/reports` | `review:moderate` | List user-submitted abuse & spam reports with reason filters |
| `GET` | `/api/v1/reviews/admin/reports/:id` | `review:moderate` | Inspect full abuse report details (reporter, author, review, product) |
| `PATCH` | `/api/v1/reviews/admin/reports/:id/resolve` | `review:moderate` | Resolve abuse report and automatically action target review |
| `DELETE` | `/api/v1/reviews/:id` | `review:delete` / `SUPER_ADMIN` | Permanently delete a review |

---

## Admin Endpoint Specifications & Scenarios

---

### 1. List All Platform Reviews (`GET /admin/all`)

Lists all reviews across all moderation statuses (`PENDING`, `APPROVED`, `REJECTED`) with filtering by product, customer, star rating, verified purchase badge, and date sorting.

- **Method**: `GET`
- **URL**: `/api/v1/reviews/admin/all`
- **Permission**: `review:read` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |
| `productId` | `UUID` | No | - | Filter reviews by product ID |
| `userId` | `UUID` | No | - | Filter reviews by author user ID |
| `status` | `enum` | No | - | `PENDING`, `APPROVED`, `REJECTED` |
| `rating` | `integer` | No | - | Filter by star rating (1 to 5) |
| `isVerifiedPurchase`| `boolean` | No | - | Filter verified buyers |
| `sortBy` | `enum` | No | `createdAt` | `createdAt`, `rating` |
| `sortOrder` | `enum` | No | `desc` | `asc` or `desc` |

#### Scenarios

##### Scenario 1.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "All reviews fetched successfully",
  "data": {
    "items": [
      {
        "id": "rev-11111111-2222-3333-4444-555555555555",
        "productId": "prod-11111111-2222-3333-4444-555555555555",
        "userId": "u1111111-2222-3333-4444-555555555555",
        "rating": 5,
        "title": "Outstanding durability and comfort",
        "content": "Been using these for 2 months, superior quality and perfect sizing.",
        "images": ["https://ik.imagekit.io/reviews/shoe-photo1.jpg"],
        "isVerifiedPurchase": true,
        "status": "APPROVED",
        "moderatedBy": "admin-1111-2222",
        "moderatedAt": "2026-09-08T10:00:00.000Z",
        "moderationNote": "Verified authentic customer photos",
        "user": {
          "id": "u1111111-2222-3333-4444-555555555555",
          "firstName": "Sarah",
          "lastName": "Connor"
        },
        "product": {
          "id": "prod-11111111-2222-3333-4444-555555555555",
          "name": "Performance Running Shoes",
          "slug": "performance-running-shoes"
        },
        "createdAt": "2026-09-07T14:30:00.000Z"
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
  "message": "Forbidden: Required permission 'review:read' missing",
  "statusCode": 403
}
```

---

### 2. Pending Moderation Queue (`GET /admin/queue`)

Retrieves the prioritized FIFO moderation queue of submitted reviews awaiting administrative verification (`status: PENDING`), including abuse report counts.

- **Method**: `GET`
- **URL**: `/api/v1/reviews/admin/queue`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page |
| `productId` | `UUID` | No | - | Filter queue by target product |

#### Scenarios

##### Scenario 2.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Moderation queue fetched successfully",
  "data": {
    "items": [
      {
        "id": "rev-22222222-3333-4444-5555-666666666666",
        "productId": "prod-11111111-2222-3333-4444-555555555555",
        "rating": 1,
        "title": "Suspected competitor review",
        "content": "DO NOT BUY! Buy from Brand X instead at discount URL.",
        "images": [],
        "isVerifiedPurchase": false,
        "status": "PENDING",
        "_count": {
          "reports": 3
        },
        "user": {
          "id": "u2222222-3333-4444-5555-666666666666",
          "firstName": "Anonymous",
          "lastName": "User",
          "email": "spam@example.com"
        },
        "product": {
          "id": "prod-11111111-2222-3333-4444-555555555555",
          "name": "Performance Running Shoes",
          "slug": "performance-running-shoes"
        },
        "createdAt": "2026-09-08T08:00:00.000Z"
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

### 3. Moderate Single Review (`PATCH /admin/:id/moderate`)

Approves or rejects an individual review with mandatory state transition and audit note logging.

- **Method**: `PATCH`
- **URL**: `/api/v1/reviews/admin/:id/moderate`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Target review UUID |

#### Request Body Schema
| Field | Type | Required | Values | Description |
|---|---|---|---|---|
| `status` | `enum` | Yes | `APPROVED`, `REJECTED` | New review moderation status |
| `moderationNote` | `string` | No | Max 500 chars | Reason for decision (e.g., "Violates policy on competitor promotion") |

#### Request Body Example
```json
{
  "status": "REJECTED",
  "moderationNote": "Spam promo links and competitor referral detected"
}
```

#### Scenarios

##### Scenario 3.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Review moderated successfully",
  "data": {
    "id": "rev-22222222-3333-4444-5555-666666666666",
    "status": "REJECTED",
    "moderatedBy": "admin-1111-2222",
    "moderatedAt": "2026-09-08T18:45:00.000Z",
    "moderationNote": "Spam promo links and competitor referral detected"
  }
}
```

##### Scenario 3.B: Error - Review Not Found (`404 Not Found`)
```json
{
  "success": false,
  "message": "Review not found",
  "statusCode": 404
}
```

---

### 4. Bulk Moderate Reviews (`POST /admin/bulk-moderate`)

Moderates a batch of up to 100 reviews in a single atomic database operation.

- **Method**: `POST`
- **URL**: `/api/v1/reviews/admin/bulk-moderate`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `reviewIds` | `array<UUID>` | Yes | Min: 1, Max: 100 items | Array of review UUIDs |
| `status` | `enum` | Yes | `APPROVED`, `REJECTED` | Target status for all reviews |
| `moderationNote` | `string` | No | Max 500 chars | Batch audit note |

#### Request Body Example
```json
{
  "reviewIds": [
    "rev-11111111-2222-3333-4444-555555555555",
    "rev-22222222-3333-4444-5555-666666666666",
    "rev-33333333-4444-5555-6666-777777777777"
  ],
  "status": "APPROVED",
  "moderationNote": "Batch approved verified purchase batch"
}
```

#### Scenarios

##### Scenario 4.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Bulk moderation completed",
  "data": {
    "status": "APPROVED",
    "affectedCount": 3,
    "requestedCount": 3,
    "moderatedBy": "admin-1111-2222",
    "moderatedAt": "2026-09-08T18:46:00.000Z"
  }
}
```

##### Scenario 4.B: Error - Empty Array (`400 Bad Request`)
```json
{
  "success": false,
  "message": "Array must contain at least 1 element(s)",
  "statusCode": 400
}
```

---

### 5. List Abuse & Spam Reports (`GET /admin/reports`)

Lists all user-flagged review abuse reports with status, category, and target review filters.

- **Method**: `GET`
- **URL**: `/api/v1/reviews/admin/reports`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Items per page (Max: 100) |
| `status` | `enum` | No | - | `PENDING`, `REVIEWED`, `DISMISSED`, `ACTIONED` |
| `reason` | `enum` | No | - | `SPAM`, `HARASSMENT`, `INAPPROPRIATE`, `FAKE_REVIEW`, `OFF_TOPIC`, `OTHER` |
| `reviewId` | `UUID` | No | - | Filter reports for a specific review |
| `reporterId`| `UUID` | No | - | Filter reports submitted by a specific user |

#### Scenarios

##### Scenario 5.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Review reports fetched successfully",
  "data": {
    "items": [
      {
        "id": "rep-11111111-2222-3333-4444-555555555555",
        "reviewId": "rev-22222222-3333-4444-5555-666666666666",
        "reporterId": "u1111111-2222-3333-4444-555555555555",
        "reason": "SPAM",
        "details": "Competitor promotional discount link posted in comments",
        "status": "PENDING",
        "createdAt": "2026-09-08T12:00:00.000Z",
        "reporter": {
          "id": "u1111111-2222-3333-4444-555555555555",
          "firstName": "Sarah",
          "lastName": "Connor",
          "email": "sarah@example.com"
        },
        "review": {
          "id": "rev-22222222-3333-4444-5555-666666666666",
          "rating": 1,
          "title": "Suspected competitor review",
          "content": "DO NOT BUY! Buy from Brand X instead at discount URL.",
          "status": "PENDING",
          "user": {
            "firstName": "Anonymous",
            "lastName": "User"
          },
          "product": {
            "name": "Performance Running Shoes"
          }
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

---

### 6. Get Abuse Report Details (`GET /admin/reports/:id`)

Retrieves in-depth details of a specific abuse report, including reporter details, the target review, review author, and resolution history.

- **Method**: `GET`
- **URL**: `/api/v1/reviews/admin/reports/:id`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### URL Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Abuse report UUID |

#### Scenarios

##### Scenario 6.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Report fetched successfully",
  "data": {
    "id": "rep-11111111-2222-3333-4444-555555555555",
    "reviewId": "rev-22222222-3333-4444-5555-666666666666",
    "reporterId": "u1111111-2222-3333-4444-555555555555",
    "reason": "SPAM",
    "details": "Competitor promotional discount link posted in comments",
    "status": "PENDING",
    "reporter": {
      "id": "u1111111-2222-3333-4444-555555555555",
      "firstName": "Sarah",
      "lastName": "Connor",
      "email": "sarah@example.com"
    },
    "review": {
      "id": "rev-22222222-3333-4444-5555-666666666666",
      "rating": 1,
      "title": "Suspected competitor review",
      "content": "DO NOT BUY! Buy from Brand X instead at discount URL.",
      "status": "PENDING",
      "user": {
        "id": "u2222222-3333-4444-5555-666666666666",
        "firstName": "Anonymous",
        "lastName": "User",
        "email": "spam@example.com"
      },
      "product": {
        "id": "prod-11111111-2222-3333-4444-555555555555",
        "name": "Performance Running Shoes",
        "slug": "performance-running-shoes"
      }
    },
    "createdAt": "2026-09-08T12:00:00.000Z"
  }
}
```

---

### 7. Resolve Abuse Report & Action Review (`PATCH /admin/reports/:id/resolve`)

Resolves an abuse report and simultaneously executes the chosen moderation action on the target review (`APPROVE_REVIEW`, `REJECT_REVIEW`, `DELETE_REVIEW`, or `NO_ACTION`).

- **Method**: `PATCH`
- **URL**: `/api/v1/reviews/admin/reports/:id/resolve`
- **Permission**: `review:moderate` or `SUPER_ADMIN`

#### Request Body Schema
| Field | Type | Required | Values | Description |
|---|---|---|---|---|
| `status` | `enum` | Yes | `REVIEWED`, `DISMISSED`, `ACTIONED` | Resolution status |
| `action` | `enum` | No | `APPROVE_REVIEW`, `REJECT_REVIEW`, `DELETE_REVIEW`, `NO_ACTION` | Automated action on target review (Default: `NO_ACTION`) |
| `resolutionNote` | `string` | No | Max 500 chars | Admin resolution summary |

#### Request Body Example
```json
{
  "status": "ACTIONED",
  "action": "REJECT_REVIEW",
  "resolutionNote": "Confirmed spam content. Rejected review and warned user."
}
```

#### Scenarios

##### Scenario 7.A: Success - Report Actioned and Review Rejected (`200 OK`)
```json
{
  "success": true,
  "message": "Report resolved successfully with action: REJECT_REVIEW",
  "data": {
    "id": "rep-11111111-2222-3333-4444-555555555555",
    "status": "ACTIONED",
    "resolvedBy": "admin-1111-2222",
    "resolvedAt": "2026-09-08T18:48:00.000Z",
    "resolutionNote": "Confirmed spam content. Rejected review and warned user.",
    "action": "REJECT_REVIEW"
  }
}
```

##### Scenario 7.B: Success - Report Dismissed as False Positive (`200 OK`)
- **Request**: `{"status": "DISMISSED", "action": "NO_ACTION", "resolutionNote": "Legitimate customer dissatisfaction; not spam."}`
```json
{
  "success": true,
  "message": "Report resolved successfully with action: NO_ACTION",
  "data": {
    "id": "rep-11111111-2222-3333-4444-555555555555",
    "status": "DISMISSED",
    "resolvedBy": "admin-1111-2222",
    "resolvedAt": "2026-09-08T18:49:00.000Z",
    "resolutionNote": "Legitimate customer dissatisfaction; not spam."
  }
}
```

---

### 8. Delete Review (`DELETE /:id`)

Permanently removes a review from the database and recalculates the product's average rating.

- **Method**: `DELETE`
- **URL**: `/api/v1/reviews/:id`
- **Permission**: `review:delete` or `SUPER_ADMIN` (or Review Owner)

#### Scenarios

##### Scenario 8.A: Success (`200 OK`)
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

---

## Public & Storefront Impact Reference

When administrators moderate reviews:
- **`APPROVED`**: Immediately rendered on the storefront product page, factored into total reviews count, and included in `GET /api/v1/reviews/products/:productId/summary` star breakdown.
- **`REJECTED` / `PENDING`**: Omitted from public product review queries and excluded from star rating calculations.
- **Verified Purchase**: Indicates the reviewer has an immutable completed order on file for the product.

---

## Security & Error Codes Reference

| HTTP Status | Reason | Typical Trigger |
|---|---|---|
| `200 OK` | Success | Queue list, report details, moderation update, resolution |
| `400 Bad Request` | Validation Error | Invalid status enum, missing required fields |
| `401 Unauthorized` | Auth Required | Missing `Authorization: Bearer <token>` |
| `403 Forbidden` | Permission Missing | Account lacks `review:read` or `review:moderate` permission |
| `404 Not Found` | Not Found | Target review or abuse report UUID does not exist |
| `409 Conflict` | Conflict | User attempting to report the same review twice |
