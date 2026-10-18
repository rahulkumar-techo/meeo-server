# 🔍 Product Details & Variant Selection

This guide details fetching complete product data for Product Detail Pages (PDP), including SKU variants, dynamic pricing, inventory availability, images, and configurable attributes (color, size, material).

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products/:id` | Public | Fetch product by UUID |
| `GET` | `/api/v1/products/slug/:slug` | Public | Fetch product by URL slug (SEO-friendly) |
| `GET` | `/api/v1/products/:id/attributes` | Public | Fetch attribute matrix (e.g. Color, Size options) |

---

## 1. Fetch Product by URL Slug

Standard PDP endpoint for frontend routing (e.g. `/products/ultra-light-performance-running-shoes`).

### Request
```http
GET /api/v1/products/slug/ultra-light-performance-running-shoes HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "prod_01J8R9QWE1001",
    "title": "Ultra-light Performance Running Shoes",
    "slug": "ultra-light-performance-running-shoes",
    "description": "Engineered for marathon endurance with responsive foam cushioning and breathable mesh.",
    "basePrice": 129.99,
    "salePrice": 99.99,
    "currency": "USD",
    "status": "ACTIVE",
    "sku": "RUN-SHOE-BASE",
    "metaTitle": "Ultra-light Performance Running Shoes - AeroAthletics",
    "metaDescription": "Buy lightweight marathon running shoes with responsive foam cushioning.",
    "category": {
      "id": "cat_01J8R9QW",
      "name": "Footwear",
      "slug": "footwear"
    },
    "brand": {
      "id": "brd_01J8R9XYZ",
      "name": "AeroAthletics",
      "slug": "aero-athletics",
      "logoUrl": "https://assets.example.com/brands/aero.png"
    },
    "images": [
      {
        "id": "img_01",
        "url": "https://assets.example.com/products/running-shoes-cyan-1.jpg",
        "altText": "Cyan side angle",
        "isPrimary": true
      },
      {
        "id": "img_02",
        "url": "https://assets.example.com/products/running-shoes-cyan-2.jpg",
        "altText": "Cyan sole view",
        "isPrimary": false
      }
    ],
    "variants": [
      {
        "id": "var_cyan_sz10_01",
        "title": "Cyan / Size 10",
        "sku": "RUN-SHOE-CYAN-10",
        "barcode": "8901234567890",
        "price": 99.99,
        "compareAtPrice": 129.99,
        "stock": 14,
        "isAvailable": true,
        "attributes": [
          { "name": "Color", "value": "Cyan", "hex": "#00FFFF" },
          { "name": "Size", "value": "10" }
        ],
        "images": [
          { "url": "https://assets.example.com/products/running-shoes-cyan-1.jpg" }
        ]
      },
      {
        "id": "var_red_sz10_02",
        "title": "Red / Size 10",
        "sku": "RUN-SHOE-RED-10",
        "barcode": "8901234567891",
        "price": 109.99,
        "compareAtPrice": 129.99,
        "stock": 0,
        "isAvailable": false,
        "attributes": [
          { "name": "Color", "value": "Red", "hex": "#FF0000" },
          { "name": "Size", "value": "10" }
        ]
      }
    ],
    "ratingSummary": {
      "averageRating": 4.8,
      "totalReviews": 124
    }
  }
}
```

---

## 2. Fetch Product Configurable Attributes

Extracts all selectable attributes for multi-dimensional swatch selectors (Color swatches, Size pills).

### Request
```http
GET /api/v1/products/prod_01J8R9QWE1001/attributes HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "attributeId": "attr_color",
      "name": "Color",
      "type": "COLOR_SWATCH",
      "values": [
        { "value": "Cyan", "hex": "#00FFFF", "inStock": true },
        { "value": "Red", "hex": "#FF0000", "inStock": false }
      ]
    },
    {
      "attributeId": "attr_size",
      "name": "Size",
      "type": "BUTTON_PILL",
      "values": [
        { "value": "9", "inStock": true },
        { "value": "10", "inStock": true },
        { "value": "11", "inStock": false }
      ]
    }
  ]
}
```

---

## 💡 Best Practices for Frontend Variant Selection Logic

1. **Active Variant Resolution**: When a user clicks a color swatch and size button, match the composite attributes against `product.variants` to retrieve the active `variantId`.
2. **Out-of-Stock Handling**: If `stock === 0` or `isAvailable === false`, disable the *"Add to Cart"* button and switch the CTA to *"Notify When Available"* or *"Save to Wishlist"*.
3. **Cart Submission**: Pass the selected `variantId` (not `productId`) to the cart endpoint (`POST /api/v1/cart/items`).
