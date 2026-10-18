# ✍️ Submit & Manage Customer Reviews

This guide details submitting product reviews with photo uploads, editing/deleting existing reviews, casting helpfulness votes, and reporting abusive content.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/reviews` | Authenticated | Submit product review & rating (auto detects verified buyer) |
| `GET` | `/api/v1/reviews/my-reviews` | Authenticated | List all reviews submitted by the customer |
| `PUT` | `/api/v1/reviews/:id` | Authenticated | Edit review (resets to PENDING moderation) |
| `DELETE` | `/api/v1/reviews/:id` | Authenticated | Delete customer's own review |
| `POST` | `/api/v1/reviews/:id/report` | Authenticated | Report inappropriate review / spam |

---

## 1. Submit Product Review

When a customer posts a review, the server automatically inspects their historical completed orders to set `isVerifiedPurchase: true`.

### Request
```http
POST /api/v1/reviews HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "productId": "prod_01J8R9QWE1001",
  "rating": 5,
  "title": "Best running shoes I have ever owned",
  "content": "Super comfortable, fit true to size. High quality materials throughout.",
  "images": [
    "https://assets.example.com/uploads/review-pic-1.jpg"
  ]
}
```

### Response `201 Created`
```json
{
  "success": true,
  "message": "Review submitted successfully and submitted for moderation.",
  "data": {
    "id": "rev_01J8R9QWE88",
    "productId": "prod_01J8R9QWE1001",
    "rating": 5,
    "title": "Best running shoes I have ever owned",
    "content": "Super comfortable, fit true to size. High quality materials throughout.",
    "isVerifiedPurchase": true,
    "status": "APPROVED",
    "createdAt": "2026-09-12T07:25:00.000Z"
  }
}
```

---

## 2. Customer's Submitted Reviews History

### Request
```http
GET /api/v1/reviews/my-reviews HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "rev_01J8R9QWE88",
      "productId": "prod_01J8R9QWE1001",
      "productTitle": "Ultra-light Performance Running Shoes",
      "rating": 5,
      "title": "Best running shoes I have ever owned",
      "status": "APPROVED",
      "helpfulCount": 34,
      "createdAt": "2026-09-12T07:25:00.000Z"
    }
  ]
}
```

---

## 3. Update Existing Review

### Request
```http
PUT /api/v1/reviews/rev_01J8R9QWE88 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "rating": 5,
  "title": "Updated: Still going strong after 300 miles!",
  "content": "Tread wear is minimal even after 300 miles on asphalt."
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "id": "rev_01J8R9QWE88",
    "rating": 5,
    "title": "Updated: Still going strong after 300 miles!"
  }
}
```

---

## 4. Report Review for Abuse / Spam

### Request
```http
POST /api/v1/reviews/rev_01J8R9QWE88/report HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reason": "SPAM",
  "details": "Contains promotional links to external competitor website."
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Report submitted. Our moderation team will inspect this review."
}
```
