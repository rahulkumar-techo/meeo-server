# 🛍️ Customer Products API Reference

Comprehensive documentation for **Customer Storefront & Mobile App** product catalog operations. Covers product listings, search, filtering, pagination, product detail views (PDP), and attribute variant selection.

---

## 📌 Endpoints Summary

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | Public | List products with pagination, category/brand filters, search, and sorting (returns primary image and active variants) |
| `GET` | `/api/v1/products/:id` | Public | Get complete product details by UUID (PDP with all gallery images & full variant inventory) |
| `GET` | `/api/v1/products/slug/:slug` | Public | Get complete product details by URL slug (SEO-friendly PDP) |
| `GET` | `/api/v1/products/:id/attributes` | Public | Get grouped attribute options (e.g., Color swatches, Size pills) for variant selection |

---

## 1. List Products (Storefront Listing & Grid)

Fetches active products for catalog browsing, category pages, search results, and brand collections.

### 🌐 Request
```http
GET /api/v1/products?page=1&limit=20&categoryId=a1b2c3d4-e5f6-7890-abcd-ef1234567890&search=running&sortBy=createdAt&sortOrder=desc HTTP/1.1
Host: api.example.com
Accept: application/json
```

### 🔍 Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `integer` | No | `1` | Page number for offset pagination (min: 1) |
| `limit` | `integer` | No | `20` | Items per page (min: 1, max: 100) |
| `search` | `string` | No | - | Case-insensitive text search across product name, description, slug, and SEO title |
| `categoryId` | `string` (UUID) | No | - | Filter by Category UUID |
| `brandId` | `string` (UUID) | No | - | Filter by Brand UUID |
| `isFeatured` | `boolean` | No | - | Filter only featured products (`true` / `false`) |
| `sortBy` | `string` | No | `createdAt` | Field to sort by: `createdAt`, `name`, `updatedAt` |
| `sortOrder` | `string` | No | `desc` | Sort direction: `asc` or `desc` |
| `cursor` | `string` | No | - | Optional cursor UUID for infinite-scroll cursor pagination |

### 📤 Response `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Products retrieved successfully",
  "data": {
    "items": [
      {
        "id": "c1f7a08b-58cc-4372-a567-0e02b2c3d479",
        "name": "Nike Air Zoom Pegasus 40",
        "slug": "nike-air-zoom-pegasus-40",
        "description": "Engineered for daily running with responsive Nike React foam.",
        "status": "ACTIVE",
        "isFeatured": true,
        "seoTitle": "Nike Air Zoom Pegasus 40 - High Performance Running Shoes",
        "createdAt": "2026-09-24T06:00:00.000Z",
        "updatedAt": "2026-09-24T06:00:00.000Z",
        "category": {
          "id": "e4a23456-58cc-4372-a567-0e02b2c3d111",
          "name": "Footwear"
        },
        "brand": {
          "id": "b9c12345-58cc-4372-a567-0e02b2c3d222",
          "name": "Nike",
          "slug": "nike"
        },
        "images": [
          {
            "id": "img_01J8R9XYZ100",
            "url": "https://ik.imagekit.io/your_store/products/pegasus-40-main.jpg"
          }
        ],
        "variants": [
          {
            "id": "var_01J8R9XYZ001",
            "sku": "PEG-40-BLK-9",
            "price": "129.99",
            "compareAtPrice": "149.99",
            "status": "ACTIVE"
          },
          {
            "id": "var_01J8R9XYZ002",
            "sku": "PEG-40-BLK-10",
            "price": "129.99",
            "compareAtPrice": "149.99",
            "status": "ACTIVE"
          }
        ]
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

## 2. Get Product by ID

Retrieves full product details by unique product UUID. Used for Product Detail Pages (PDP) when linking via ID.

### 🌐 Request
```http
GET /api/v1/products/c1f7a08b-58cc-4372-a567-0e02b2c3d479 HTTP/1.1
Host: api.example.com
Accept: application/json
```

### 🏷️ Path Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` (UUID) | Yes | Product unique identifier |

### 📤 Response `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product retrieved successfully",
  "data": {
    "id": "c1f7a08b-58cc-4372-a567-0e02b2c3d479",
    "name": "Nike Air Zoom Pegasus 40",
    "slug": "nike-air-zoom-pegasus-40",
    "description": "Engineered for daily running with responsive Nike React foam and dual Zoom Air units.",
    "status": "ACTIVE",
    "isFeatured": true,
    "seoTitle": "Nike Air Zoom Pegasus 40 - High Performance Running Shoes",
    "seoDescription": "Shop Nike Air Zoom Pegasus 40 for optimal cushion and durability.",
    "createdAt": "2026-09-24T06:00:00.000Z",
    "updatedAt": "2026-09-24T06:00:00.000Z",
    "category": {
      "id": "e4a23456-58cc-4372-a567-0e02b2c3d111",
      "name": "Footwear",
      "slug": "footwear"
    },
    "brand": {
      "id": "b9c12345-58cc-4372-a567-0e02b2c3d222",
      "name": "Nike",
      "slug": "nike",
      "logoUrl": "https://ik.imagekit.io/your_store/brands/nike-logo.png"
    },
    "images": [
      {
        "id": "img_01J8R9XYZ100",
        "url": "https://ik.imagekit.io/your_store/products/pegasus-40-main.jpg",
        "thumbnailUrl": "https://ik.imagekit.io/your_store/products/tr:w-200/pegasus-40-main.jpg",
        "altText": "Front and side view of Nike Pegasus 40",
        "sortOrder": 0
      },
      {
        "id": "img_01J8R9XYZ101",
        "url": "https://ik.imagekit.io/your_store/products/pegasus-40-sole.jpg",
        "thumbnailUrl": "https://ik.imagekit.io/your_store/products/tr:w-200/pegasus-40-sole.jpg",
        "altText": "Traction outsole view",
        "sortOrder": 1
      }
    ],
    "variants": [
      {
        "id": "var_01J8R9XYZ001",
        "productId": "c1f7a08b-58cc-4372-a567-0e02b2c3d479",
        "sku": "PEG-40-BLK-9",
        "barcode": "8901234567890",
        "price": "129.99",
        "compareAtPrice": "149.99",
        "status": "ACTIVE",
        "inventory": {
          "availableQuantity": 15,
          "reorderLevel": 3
        },
        "attributeValues": [
          {
            "attributeValue": {
              "id": "val_color_black",
              "value": "Black",
              "attribute": {
                "id": "attr_color",
                "name": "Color"
              }
            }
          },
          {
            "attributeValue": {
              "id": "val_size_9",
              "value": "9",
              "attribute": {
                "id": "attr_size",
                "name": "Size"
              }
            }
          }
        ],
        "images": []
      }
    ]
  }
}
```

### ❌ Error Response `404 Not Found`
```json
{
  "success": false,
  "statusCode": 404,
  "error": "NOT_FOUND",
  "message": "Product not found",
  "timestamp": "2026-09-24T06:00:00.000Z"
}
```

---

## 3. Get Product by Slug (Recommended for Web & Deep Links)

Retrieves full product details using the SEO-friendly URL slug.

### 🌐 Request
```http
GET /api/v1/products/slug/nike-air-zoom-pegasus-40 HTTP/1.1
Host: api.example.com
Accept: application/json
```

### 🏷️ Path Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `slug` | `string` | Yes | Unique URL slug of the product |

### 📤 Response `200 OK`
Returns the same product JSON schema as `GET /api/v1/products/:id`.

---

## 4. Get Product Attributes Matrix

Retrieves all unique selectable attribute keys and their available values for interactive swatch pickers (e.g., Color circles, Size buttons).

### 🌐 Request
```http
GET /api/v1/products/c1f7a08b-58cc-4372-a567-0e02b2c3d479/attributes HTTP/1.1
Host: api.example.com
Accept: application/json
```

### 🏷️ Path Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` (UUID) | Yes | Product unique identifier |

### 📤 Response `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Product attributes retrieved successfully",
  "data": [
    {
      "id": "attr_color_uuid",
      "name": "Color",
      "values": [
        { "id": "val_black_uuid", "value": "Black" },
        { "id": "val_cyan_uuid", "value": "Cyan" },
        { "id": "val_white_uuid", "value": "White" }
      ]
    },
    {
      "id": "attr_size_uuid",
      "name": "Size",
      "values": [
        { "id": "val_size_8_uuid", "value": "8" },
        { "id": "val_size_9_uuid", "value": "9" },
        { "id": "val_size_10_uuid", "value": "10" }
      ]
    }
  ]
}
```

---

## 📱 Frontend Integration Best Practices (React / React Native)

### 1. Adding Item to Cart
Always pass the **`variant.id`** (not the root `product.id`) when adding an item to the shopping cart:
```ts
// POST /api/v1/cart/items
const payload = {
  variantId: selectedVariant.id,
  quantity: 1,
};
```

### 2. Resolving Primary Image for Product Card
In product listings (`GET /api/v1/products`), the `images` array contains the primary image:
```ts
const thumbnail = product.images?.[0]?.url ?? "https://via.placeholder.com/300";
```

### 3. Price Display Logic
```ts
const defaultVariant = product.variants?.[0];
const price = Number(defaultVariant?.price ?? 0);
const compareAtPrice = defaultVariant?.compareAtPrice ? Number(defaultVariant.compareAtPrice) : null;
const hasDiscount = compareAtPrice !== null && compareAtPrice > price;
```
