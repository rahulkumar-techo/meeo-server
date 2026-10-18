# Product Variants API Documentation (Client & Dashboard Integration)

> **Base Route**: `/api/v1`  
> **Route Files**: [`src/modules/catalog/routes/productVariant.route.ts`](file:///e:/e-com/server/src/modules/catalog/routes/productVariant.route.ts)  
> **Controller**: [`src/modules/catalog/controller/productVariant.controller.ts`](file:///e:/e-com/server/src/modules/catalog/controller/productVariant.controller.ts)  
> **Validation**: [`src/modules/catalog/validations/productVariant.validation.ts`](file:///e:/e-com/server/src/modules/catalog/validations/productVariant.validation.ts)  

---

## 📌 Overview

This document provides complete integration specifications for frontend client applications and admin dashboards managing **SKUs, variant pricing, barcode tracking, dynamic attributes (Color, Size, Material), and initial inventory stock levels**.

### Base URLs

- **Product-Scoped Variants**: `/api/v1/products/:productId/variants`
- **Direct Variant Operations**: `/api/v1/variants`

---

## 🔐 Authentication & Headers

| Header | Required For | Description |
|---|---|---|
| `Authorization: Bearer <accessToken>` | Mutating actions (`POST`, `PATCH`, `DELETE`) | Admin/Manager JWT Token |
| `x-csrf-token: <csrfToken>` | Cookie sessions | CSRF token for state mutations |
| `Content-Type: application/json` | All `POST`, `PATCH`, `PUT` requests | JSON request body |

---

## 📋 Endpoints Summary

| Method | Endpoint | Access | Summary |
|---|---|---|---|
| `GET` | `/api/v1/products/:productId/variants` | Public | List all variants for a product (paginated, filtered) |
| `POST` | `/api/v1/products/:productId/variants` | Creator OR Admin | Create a single variant with stock & attributes |
| `POST` | `/api/v1/products/:productId/variants/batch` | Creator OR Admin | **Batch create** multiple variants in one transaction |
| `GET` | `/api/v1/variants/:id` | Public | Get variant details by Variant UUID |
| `GET` | `/api/v1/variants/sku/:sku` | Public | Get variant details by SKU code |
| `PATCH` | `/api/v1/variants/:id` | Creator OR Admin | Update variant pricing, SKU, barcode, status, or attributes |
| `DELETE` | `/api/v1/variants/:id` | Creator OR Admin | Delete a variant from catalog |

---

## 🛠️ Endpoint Specifications

---

### 1. List Product Variants (Dashboard / Storefront)
Fetch all variants belonging to a specific parent product.

- **Method**: `GET`
- **URL**: `/api/v1/products/:productId/variants`
- **Access**: Public

#### Path Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `productId` | `UUID` | Yes | Parent product UUID |

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `search` | `string` | No | - | Search by SKU or barcode |
| `status` | `enum` | No | - | Filter by `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `page` | `integer` | No | `1` | Page number (Min: 1) |
| `limit` | `integer` | No | `20` | Items per page (Min: 1, Max: 100) |
| `sortBy` | `enum` | No | `createdAt` | `sku`, `price`, `createdAt`, `updatedAt`, `status` |
| `sortOrder` | `enum` | No | `asc` | `asc` or `desc` |

#### Example Request
```http
GET /api/v1/products/c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd/variants?page=1&limit=20&sortBy=price&sortOrder=asc
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product variants retrieved successfully",
  "data": {
    "items": [
      {
        "id": "99999999-9999-9999-9999-999999999999",
        "productId": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
        "sku": "NK-AIR-BLK-10",
        "barcode": "012345678901",
        "price": 149.99,
        "compareAtPrice": 179.99,
        "costPrice": 65.00,
        "status": "ACTIVE",
        "inventory": {
          "quantity": 50,
          "reservedQuantity": 2,
          "availableQuantity": 48,
          "reorderLevel": 10
        },
        "attributeValues": [
          {
            "id": "attr-val-uuid-1",
            "value": "Black",
            "attribute": { "id": "attr-uuid-1", "name": "Color" }
          },
          {
            "id": "attr-val-uuid-2",
            "value": "US 10",
            "attribute": { "id": "attr-uuid-2", "name": "Size" }
          }
        ],
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-02T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

---

### 2. Create Single Product Variant
Creates a single variant for a product with initial inventory tracking.

- **Method**: `POST`
- **URL**: `/api/v1/products/:productId/variants`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: Product Creator **OR** `product:update`

#### Path Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `productId` | `UUID` | Yes | Parent product UUID |

#### Request Body (`application/json`)
| Field | Type | Required | Default | Validation Rules / Notes |
|---|---|---|---|---|
| `sku` | `string` | Yes | - | Alphanumeric, hyphens, dots, underscores (`A-Z, 0-9, ._-`). Auto-converted to uppercase. |
| `price` | `number` | Yes | - | Selling price (Must be `> 0`, max `999999999.99`) |
| `compareAtPrice` | `number \| null` | No | `null` | Original MRP/strike-through price (`>= price`) |
| `costPrice` | `number \| null` | No | `null` | Cost per item for profit margin tracking |
| `barcode` | `string \| null` | No | `null` | UPC/EAN/ISBN barcode (Max 64 chars) |
| `status` | `enum` | No | `ACTIVE` | `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` |
| `attributeValueIds`| `string[]` | No | `[]` | Array of Attribute Value UUIDs (e.g. `[ColorId, SizeId]`) |
| `initialStock` | `integer` | No | `0` | Initial inventory stock count (Min: `0`) |
| `reorderLevel` | `integer \| null`| No | `null` | Low stock alert threshold |

#### Example Request
```json
{
  "sku": "NK-AIR-BLK-10",
  "barcode": "012345678901",
  "price": 149.99,
  "compareAtPrice": 179.99,
  "costPrice": 65.00,
  "status": "ACTIVE",
  "attributeValueIds": [
    "55555555-5555-5555-5555-555555555555",
    "66666666-6666-6666-6666-666666666666"
  ],
  "initialStock": 50,
  "reorderLevel": 10
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product variant created successfully",
  "data": {
    "id": "99999999-9999-9999-9999-999999999999",
    "productId": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
    "sku": "NK-AIR-BLK-10",
    "barcode": "012345678901",
    "price": 149.99,
    "compareAtPrice": 179.99,
    "costPrice": 65.00,
    "status": "ACTIVE",
    "inventoryQuantity": 50,
    "createdAt": "2026-09-07T16:20:00.000Z"
  }
}
```

---

### 3. Batch Create Variants (Matrix Generator)
Transactionally creates multiple variants (e.g. Size × Color matrix) in one single database call.

- **Method**: `POST`
- **URL**: `/api/v1/products/:productId/variants/batch`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: Product Creator **OR** `product:update`

#### Request Body (`application/json`)
```json
{
  "variants": [
    {
      "sku": "NK-AIR-BLK-09",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "costPrice": 65.00,
      "attributeValueIds": ["color-black-uuid", "size-9-uuid"],
      "initialStock": 25,
      "status": "ACTIVE"
    },
    {
      "sku": "NK-AIR-BLK-10",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "costPrice": 65.00,
      "attributeValueIds": ["color-black-uuid", "size-10-uuid"],
      "initialStock": 30,
      "status": "ACTIVE"
    },
    {
      "sku": "NK-AIR-WHT-09",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "costPrice": 65.00,
      "attributeValueIds": ["color-white-uuid", "size-9-uuid"],
      "initialStock": 15,
      "status": "ACTIVE"
    }
  ]
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product variants created successfully in batch",
  "data": {
    "count": 3,
    "variants": [
      { "id": "uuid-1", "sku": "NK-AIR-BLK-09", "price": 149.99, "status": "ACTIVE" },
      { "id": "uuid-2", "sku": "NK-AIR-BLK-10", "price": 149.99, "status": "ACTIVE" },
      { "id": "uuid-3", "sku": "NK-AIR-WHT-09", "price": 149.99, "status": "ACTIVE" }
    ]
  }
}
```

---

### 4. Get Variant by ID
Retrieve complete variant details by its Variant UUID.

- **Method**: `GET`
- **URL**: `/api/v1/variants/:id`
- **Access**: Public

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product variant retrieved successfully",
  "data": {
    "id": "99999999-9999-9999-9999-999999999999",
    "productId": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
    "sku": "NK-AIR-BLK-10",
    "barcode": "012345678901",
    "price": 149.99,
    "compareAtPrice": 179.99,
    "costPrice": 65.00,
    "status": "ACTIVE",
    "product": {
      "id": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
      "name": "Nike Air Max Pulse",
      "slug": "nike-air-max-pulse"
    },
    "inventory": {
      "quantity": 50,
      "reservedQuantity": 2,
      "availableQuantity": 48
    },
    "attributeValues": [
      { "id": "attr-1", "value": "Black", "attribute": { "name": "Color" } },
      { "id": "attr-2", "value": "US 10", "attribute": { "name": "Size" } }
    ]
  }
}
```

---

### 5. Get Variant by SKU (Barcode Scanner / POS)
Useful for POS, barcode scanners, and inventory lookup.

- **Method**: `GET`
- **URL**: `/api/v1/variants/sku/:sku`
- **Access**: Public

#### Example Request
```http
GET /api/v1/variants/sku/NK-AIR-BLK-10
```

#### Response (`200 OK`)
*(Same payload structure as `GET /api/v1/variants/:id`)*

---

### 6. Update Product Variant
Modify variant pricing, SKU, barcode, status, or attribute associations.

- **Method**: `PATCH`
- **URL**: `/api/v1/variants/:id`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: Product Creator **OR** `product:update`

#### Path Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Variant UUID |

#### Request Body (`application/json`)
*(Send only the fields you want to change; at least 1 field is required)*

```json
{
  "price": 139.99,
  "compareAtPrice": 169.99,
  "barcode": "012345678999",
  "status": "ACTIVE"
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product variant updated successfully",
  "data": {
    "id": "99999999-9999-9999-9999-999999999999",
    "sku": "NK-AIR-BLK-10",
    "price": 139.99,
    "compareAtPrice": 169.99,
    "barcode": "012345678999",
    "status": "ACTIVE",
    "updatedAt": "2026-09-07T16:25:00.000Z"
  }
}
```

---

### 7. Delete Product Variant
Removes a specific variant from the catalog and archives associated inventory items.

- **Method**: `DELETE`
- **URL**: `/api/v1/variants/:id`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: Product Creator **OR** `product:delete`

#### Path Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Variant UUID |

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product variant deleted successfully",
  "data": {
    "id": "99999999-9999-9999-9999-999999999999"
  }
}
```

---

## 💻 Frontend / React Dashboard Code Snippets

### A. Fetch Variants Table for a Product
```typescript
import axios from "axios";

export async function fetchProductVariants(productId: string, page = 1, limit = 20) {
  const { data } = await axios.get(`/api/v1/products/${productId}/variants`, {
    params: { page, limit, sortBy: "sku", sortOrder: "asc" },
  });
  return data.data; // { items: [...], pagination: { ... } }
}
```

### B. Batch Create Matrix Variants
```typescript
export async function createVariantMatrix(productId: string, variantsList: any[], token: string) {
  const { data } = await axios.post(
    `/api/v1/products/${productId}/variants/batch`,
    { variants: variantsList },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  return data.data;
}
```

---

## ⚠️ Common Validation & Error Codes

| Status Code | Error Message | Solution / Cause |
|---|---|---|
| `400 Bad Request` | `"Compare-at price should be >= price"` | Ensure `compareAtPrice >= price` when discount is active. |
| `400 Bad Request` | `"SKU must contain only letters, numbers, hyphens..."` | SKU contains invalid special characters or whitespace. |
| `409 Conflict` | `"Variant with SKU 'XYZ' already exists"` | SKUs are globally unique across the entire database. |
| `404 Not Found` | `"Product not found"` or `"Variant not found"` | Invalid UUID passed in URL params. |
| `403 Forbidden` | `"You do not have permission to modify this product"` | Current user is neither the product creator nor has `product:update` permission. |
