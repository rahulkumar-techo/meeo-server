# ⭐ Product Reviews, Ratings & Breakdown Summary

This guide explains how storefront product detail pages fetch approved customer reviews, 1-to-5 star rating distributions, verified purchaser badges, and review image galleries.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reviews/products/:productId` | Public | List approved reviews with pagination & sort |
| `GET` | `/api/v1/reviews/products/:productId/summary` | Public | Rating summary (average score, star distribution count) |

---

## 1. Get Product Rating Summary

Fetches high-level metrics for PDP rating overview cards.

### Request
```http
GET /api/v1/reviews/products/prod_01J8R9QWE1001/summary HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "productId": "prod_01J8R9QWE1001",
    "averageRating": 4.8,
    "totalReviews": 124,
    "verifiedPurchasesCount": 112,
    "ratingDistribution": {
      "5": 98,
      "4": 20,
      "3": 4,
      "2": 1,
      "1": 1
    }
  }
}
```

---

## 2. List Product Reviews

### Request
```http
GET /api/v1/reviews/products/prod_01J8R9QWE1001?page=1&limit=10&rating=5&sortBy=recent HTTP/1.1
Host: api.example.com
```

### Supported Query Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `10` | Reviews per page |
| `rating` | `integer` | - | Filter by specific star rating (1-5) |
| `verifiedOnly` | `boolean` | `false` | Only verified buyer reviews |
| `hasPhotos` | `boolean` | `false` | Only reviews containing photos |
| `sortBy` | `string` | `recent` | `recent`, `highest`, `lowest`, `helpful` |

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "rev_01J8R9QWE88",
      "rating": 5,
      "title": "Incredible comfort on 20-mile runs!",
      "content": "These shoes exceeded my expectations. The foam cushioning feels springy and lightweight.",
      "isVerifiedPurchase": true,
      "helpfulCount": 34,
      "user": {
        "firstName": "Sarah",
        "lastName": "C.",
        "avatarUrl": "https://assets.example.com/avatars/sarah.jpg"
      },
      "images": [
        {
          "url": "https://assets.example.com/reviews/user_shoe_photo1.jpg"
        }
      ],
      "createdAt": "2026-09-10T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalReviews": 124,
    "totalPages": 13
  }
}
```
