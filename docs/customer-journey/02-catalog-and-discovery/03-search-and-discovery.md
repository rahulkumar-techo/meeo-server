# 🔎 Search & Discovery (Autocomplete, Facets, Recommendations)

This guide documents full-text search, live search autocomplete dropdowns, dynamic facet aggregations, and personalized discovery feeds (featured banners, trending items, new arrivals, related products).

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/search` | Public | Full-text multi-attribute product search |
| `GET` | `/api/v1/search/suggestions` | Public | Interactive instant search suggestions |
| `GET` | `/api/v1/search/facets` | Public | Contextual facet filter counts (brands, categories, price range) |
| `GET` | `/api/v1/discovery/featured` | Public | Featured spotlight promotional products |
| `GET` | `/api/v1/discovery/trending` | Public | Top-rated & high velocity trending products |
| `GET` | `/api/v1/discovery/new-arrivals` | Public | Freshly added catalog products |
| `GET` | `/api/v1/discovery/related/:productId` | Public | Contextual related item recommendations |

---

## 1. Full-Text Product Search

### Request
```http
GET /api/v1/search?q=running+shoes&category=footwear&minPrice=50&maxPrice=150&rating=4&sortBy=rating&page=1&limit=20 HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "query": "running shoes",
    "totalResults": 38,
    "items": [
      {
        "id": "prod_01J8R9QWE1001",
        "title": "Ultra-light Performance Running Shoes",
        "slug": "ultra-light-performance-running-shoes",
        "basePrice": 129.99,
        "salePrice": 99.99,
        "rating": 4.8,
        "reviewCount": 124,
        "brandName": "AeroAthletics",
        "categoryName": "Footwear",
        "thumbnailUrl": "https://assets.example.com/products/running-shoes-thumb.jpg"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 2
    }
  }
}
```

---

## 2. Interactive Search Autocomplete Suggestions

Optimized for instant search input dropdowns with debounce (~250ms).

### Request
```http
GET /api/v1/search/suggestions?q=run HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "products": [
      { "id": "prod_01", "title": "Running Shoes Pro", "slug": "running-shoes-pro" },
      { "id": "prod_02", "title": "Running Armband", "slug": "running-armband" }
    ],
    "categories": [
      { "id": "cat_01", "name": "Running Apparel", "slug": "running-apparel", "count": 14 }
    ],
    "brands": [
      { "id": "brd_01", "name": "RunnerZone", "slug": "runner-zone", "count": 9 }
    ]
  }
}
```

---

## 3. Dynamic Facets

Fetch real-time category, brand, and price boundaries for side filters.

### Request
```http
GET /api/v1/search/facets?q=shoes HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "priceRange": {
      "min": 24.99,
      "max": 289.99
    },
    "categories": [
      { "id": "cat_footwear", "name": "Footwear", "count": 45 },
      { "id": "cat_accessories", "name": "Accessories", "count": 12 }
    ],
    "brands": [
      { "id": "brd_aero", "name": "AeroAthletics", "count": 22 },
      { "id": "brd_nike", "name": "Nike", "count": 18 }
    ],
    "ratings": [
      { "stars": 4, "count": 31 },
      { "stars": 3, "count": 10 }
    ]
  }
}
```

---

## 4. Contextual Related Products (PDP Cross-sell)

### Request
```http
GET /api/v1/discovery/related/prod_01J8R9QWE1001?limit=4 HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_rel_01",
      "title": "Breathable Running Socks (3-Pack)",
      "slug": "breathable-running-socks",
      "basePrice": 14.99,
      "thumbnailUrl": "https://assets.example.com/products/socks.jpg"
    }
  ]
}
```
