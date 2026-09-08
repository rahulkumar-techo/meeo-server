# Reviews & Ratings Module API Documentation

> **Base Route**: `/api/v1/reviews`  
> **Route File**: [`src/modules/reviews/routes/review.route.ts`](file:///e:/e-com/server/src/modules/reviews/routes/review.route.ts)  
> **Controller**: [`src/modules/reviews/controller/review.controller.ts`](file:///e:/e-com/server/src/modules/reviews/controller/review.controller.ts)  
> **Services**: [`src/modules/reviews/services/review.service.ts`](file:///e:/e-com/server/src/modules/reviews/services/review.service.ts)  
> **Validations**: [`src/modules/reviews/validations/review.validation.ts`](file:///e:/e-com/server/src/modules/reviews/validations/review.validation.ts)  
> **Admin Guide**: [`src/modules/reviews/ADMIN_REVIEWS.README.md`](file:///e:/e-com/server/src/modules/reviews/ADMIN_REVIEWS.README.md)

---

## Table of Contents

1. [Architecture & Lifecycle Overview](#architecture--lifecycle-overview)
2. [Verified Purchase Verification](#verified-purchase-verification)
3. [Authentication & Authorization](#authentication--authorization)
4. [Endpoints Summary](#endpoints-summary)
5. [Public & Customer Route Specifications](#public--customer-route-specifications)
   - [1. Get Approved Product Reviews (`GET /products/:productId`)](#1-get-approved-product-reviews-get-productsproductid)
   - [2. Get Product Star Rating Breakdown (`GET /products/:productId/summary`)](#2-get-product-star-rating-breakdown-get-productsproductidsummary)
   - [3. List Authenticated Customer Reviews (`GET /my-reviews`)](#3-list-authenticated-customer-reviews-get-my-reviews)
   - [4. Submit a Product Review (`POST /`)](#4-submit-a-product-review-post-)
   - [5. Update My Review (`PUT /:id`)](#5-update-my-review-put-id)
   - [6. Delete Review (`DELETE /:id`)](#6-delete-review-delete-id)
   - [7. Report Review for Abuse / Spam (`POST /:id/report`)](#7-report-review-for-abuse--spam-post-idreport)
6. [Admin Moderation & Abuse Resolution Endpoints](#admin-moderation--abuse-resolution-endpoints)
   - [8. Admin List All Reviews (`GET /admin/all`)](#8-admin-list-all-reviews-get-adminall)
   - [9. Admin Moderation Queue (`GET /admin/queue`)](#9-admin-moderation-queue-get-adminqueue)
   - [10. Moderate Single Review (`PATCH /admin/:id/moderate`)](#10-moderate-single-review-patch-adminidmoderate)
   - [11. Bulk Moderate Reviews (`POST /admin/bulk-moderate`)](#11-bulk-moderate-reviews-post-adminbulk-moderate)
   - [12. List Abuse Reports (`GET /admin/reports`)](#12-list-abuse-reports-get-adminreports)
   - [13. Get Report Details (`GET /admin/reports/:id`)](#13-get-report-details-get-adminreportsid)
   - [14. Resolve Abuse Report (`PATCH /admin/reports/:id/resolve`)](#14-resolve-abuse-report-patch-adminreportsidresolve)
7. [Standard Response & Error Formats](#standard-response--error-formats)

---

## Architecture & Lifecycle Overview

The Reviews & Ratings module provides:
- **1–5 Star Rating System**: Optional title, written content, and up to 5 ImageKit-hosted photo attachments.
- **Verified Purchase Badging**: System automatically verifies if the reviewer has purchased the product through a completed order.
- **State Machine Moderation**: Reviews start in `PENDING` status. Only `APPROVED` reviews appear publicly on product detail pages and contribute to star breakdowns. `REJECTED` reviews are hidden.
- **Abuse Reporting & Resolution**: Authenticated users can flag spam or inappropriate reviews (`SPAM`, `HARASSMENT`, `INAPPROPRIATE`, `FAKE_REVIEW`, `OFF_TOPIC`, `OTHER`). Administrators resolve reports with linked review actions (`APPROVE_REVIEW`, `REJECT_REVIEW`, `DELETE_REVIEW`, `NO_ACTION`).

---

## Authentication & Authorization

| Header | Required For | Description |
|---|---|---|
| `Authorization: Bearer <token>` | Customer & Admin Routes | Valid JWT Access Token |

---

## Endpoints Summary

| Method | Endpoint | Access Level | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/reviews/products/:productId` | Public | None | Get approved reviews for a product with rating summary |
| `GET` | `/api/v1/reviews/products/:productId/summary` | Public | None | Get product rating score, total count, & 1–5 star distribution |
| `GET` | `/api/v1/reviews/my-reviews` | Customer | None (Own) | Get all reviews submitted by authenticated customer |
| `POST` | `/api/v1/reviews` | Customer | None | Submit product review (auto-checks verified purchase) |
| `PUT` | `/api/v1/reviews/:id` | Customer | None (Own) | Update review (resets status to `PENDING` for re-check) |
| `DELETE` | `/api/v1/reviews/:id` | Customer / Admin | Owner OR `review:delete` | Delete a review |
| `POST` | `/api/v1/reviews/:id/report` | Customer | None | Flag a review for spam, harassment, or fake review |
| `GET` | `/api/v1/reviews/admin/all` | Admin | `review:read` | List all platform reviews across all statuses |
| `GET` | `/api/v1/reviews/admin/queue` | Admin | `review:moderate` | Pending moderation queue (`status: PENDING`) |
| `PATCH` | `/api/v1/reviews/admin/:id/moderate` | Admin | `review:moderate` | Approve or Reject review with audit note |
| `POST` | `/api/v1/reviews/admin/bulk-moderate` | Admin | `review:moderate` | Batch moderate up to 100 reviews in one request |
| `GET` | `/api/v1/reviews/admin/reports` | Admin | `review:moderate` | List user abuse reports with status/reason filters |
| `GET` | `/api/v1/reviews/admin/reports/:id` | Admin | `review:moderate` | Get full abuse report details |
| `PATCH` | `/api/v1/reviews/admin/reports/:id/resolve` | Admin | `review:moderate` | Resolve abuse report and action target review |

---

## Public & Customer Route Specifications

---

### 1. Get Approved Product Reviews (`GET /products/:productId`)

- **Method**: `GET`
- **URL**: `/api/v1/reviews/products/:productId`
- **Access**: Public

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `rating` | `integer` | No | - | Filter by star rating (1–5) |
| `isVerifiedPurchase`| `boolean`| No | - | Filter verified buyers |
| `page` | `integer` | No | `1` | Page number |
| `limit` | `integer` | No | `20` | Max items per page |
| `sortBy` | `enum` | No | `createdAt` | `createdAt`, `rating` |
| `sortOrder` | `enum` | No | `desc` | `asc` or `desc` |

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product reviews fetched successfully",
  "data": {
    "items": [
      {
        "id": "rev-11111111-2222-3333-4444-555555555555",
        "rating": 5,
        "title": "Outstanding quality",
        "content": "Super comfortable and durable.",
        "images": ["https://ik.imagekit.io/reviews/photo.jpg"],
        "isVerifiedPurchase": true,
        "createdAt": "2026-09-07T14:30:00.000Z",
        "user": {
          "firstName": "Sarah",
          "lastName": "C."
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

### 2. Get Product Star Rating Breakdown (`GET /products/:productId/summary`)

- **Method**: `GET`
- **URL**: `/api/v1/reviews/products/:productId/summary`
- **Access**: Public

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product review summary fetched successfully",
  "data": {
    "averageRating": 4.6,
    "totalReviews": 42,
    "verifiedPurchasesCount": 38,
    "distribution": {
      "5": 28,
      "4": 10,
      "3": 3,
      "2": 1,
      "1": 0
    }
  }
}
```

---

### 3. List Authenticated Customer Reviews (`GET /my-reviews`)

- **Method**: `GET`
- **URL**: `/api/v1/reviews/my-reviews`
- **Access**: Authenticated Customer

---

### 4. Submit a Product Review (`POST /`)

- **Method**: `POST`
- **URL**: `/api/v1/reviews`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "productId": "prod-11111111-2222-3333-4444-555555555555",
  "rating": 5,
  "title": "Best purchase of the year",
  "content": "Exceeded expectations in design and build quality.",
  "images": ["https://ik.imagekit.io/reviews/photo1.jpg"]
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Review submitted successfully and is pending moderation",
  "data": {
    "id": "rev-11111111-2222-3333-4444-555555555555",
    "rating": 5,
    "status": "PENDING",
    "isVerifiedPurchase": true
  }
}
```

---

### 5. Update My Review (`PUT /:id`)

Updates an existing review and automatically resets status to `PENDING` for re-moderation.

- **Method**: `PUT`
- **URL**: `/api/v1/reviews/:id`
- **Access**: Authenticated Owner

---

### 6. Delete Review (`DELETE /:id`)

- **Method**: `DELETE`
- **URL**: `/api/v1/reviews/:id`
- **Access**: Review Owner OR Admin (`review:delete` / `SUPER_ADMIN`)

---

### 7. Report Review for Abuse / Spam (`POST /:id/report`)

- **Method**: `POST`
- **URL**: `/api/v1/reviews/:id/report`
- **Access**: Authenticated Customer

#### Request Body
```json
{
  "reason": "SPAM",
  "details": "Contains promotional URL for competitor store"
}
```

---

## Admin Moderation & Abuse Resolution Endpoints

*(For extensive payload schemas, bulk moderation recipes, and abuse report resolution workflows, refer to the [Admin Review Moderation Guide](file:///e:/e-com/server/src/modules/reviews/ADMIN_REVIEWS.README.md).)*

---

## Standard Response & Error Formats

### Success Response Format (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": {}
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Descriptive error message",
  "statusCode": 400
}
```
