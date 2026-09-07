# Product Module API Documentation

> **Base Route**: `/api/v1/products`  
> **Route File**: [`src/modules/catalog/routes/product.route.ts`](file:///e:/e-com/server/src/modules/catalog/routes/product.route.ts)  
> **Controller**: [`src/modules/catalog/controller/product.controller.ts`](file:///e:/e-com/server/src/modules/catalog/controller/product.controller.ts)  
> **Validation**: [`src/modules/catalog/validations/product.validation.ts`](file:///e:/e-com/server/src/modules/catalog/validations/product.validation.ts)  

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Endpoints Summary](#endpoints-summary)
4. [Endpoint Details](#endpoint-details)
   - [1. List Products (Public)](#1-list-products-public)
   - [2. Get Product by ID (Public)](#2-get-product-by-id-public)
   - [3. Get Product by Slug (Public)](#3-get-product-by-slug-public)
   - [4. Create Product (Admin/Manager)](#4-create-product-adminmanager)
   - [5. Update Product (Creator/Admin)](#5-update-product-creatoradmin)
   - [6. Publish Product (Creator/Admin)](#6-publish-product-creatoradmin)
   - [7. Revert to Draft (Creator/Admin)](#7-revert-to-draft-creatoradmin)
   - [8. Archive Product (Creator/Admin)](#8-archive-product-creatoradmin)
   - [9. Delete Product (Creator/Admin)](#9-delete-product-creatoradmin)
   - [10. Get ImageKit Client Auth (Authenticated)](#10-get-imagekit-client-auth-authenticated)
   - [11. Upload Product Image (Creator/Admin)](#11-upload-product-image-creatoradmin)
   - [12. Attach Existing Image URL (Creator/Admin)](#12-attach-existing-image-url-creatoradmin)
   - [13. Delete Product Image (Creator/Admin)](#13-delete-product-image-creatoradmin)
   - [14. Reorder Product Images (Creator/Admin)](#14-reorder-product-images-creatoradmin)
5. [Standard Response Format](#standard-response-format)
6. [Error Handling](#error-handling)

---

## Overview

The Product API module manages the lifecycle, categorization, SEO, gallery images (ImageKit integration), and status transitions (`DRAFT`, `ACTIVE`, `ARCHIVED`) of catalog products.

- **Public Access**: Any customer can view active products.
- **Creator Ownership**: The user who created the product can update, manage images, publish, archive, or delete it without elevated permissions.
- **Role-Based Access**: Elevated operations require specific permissions (`product:create`, `product:update`, `product:delete`).

---

## Authentication & Authorization

| Header | Description |
|---|---|
| `Authorization: Bearer <accessToken>` | JWT access token required for authenticated routes |
| `x-csrf-token: <csrfToken>` | CSRF token required when using session cookies |

---

## Endpoints Summary

| Method | Endpoint | Access | Permission / Ownership |
|---|---|---|---|
| `GET` | `/api/v1/products` | Public | None (Public gets `ACTIVE` only) |
| `GET` | `/api/v1/products/:id` | Public | None |
| `GET` | `/api/v1/products/:id/attributes` | Public | None (Fetch grouped attributes & values for this product) |
| `GET` | `/api/v1/products/slug/:slug` | Public | None |
| `POST` | `/api/v1/products` | Authenticated | `product:create` |
| `PATCH` | `/api/v1/products/:id` | Authenticated | Creator **OR** `product:update` |
| `POST` | `/api/v1/products/:id/publish` | Authenticated | Creator **OR** `product:update` |
| `POST` | `/api/v1/products/:id/draft` | Authenticated | Creator **OR** `product:update` |
| `POST` | `/api/v1/products/:id/archive` | Authenticated | Creator **OR** `product:update` |
| `DELETE` | `/api/v1/products/:id` | Authenticated | Creator **OR** `product:delete` |
| `GET` | `/api/v1/products/images/auth` | Authenticated | Any authenticated user |
| `POST` | `/api/v1/products/:id/images/upload` | Authenticated | Creator **OR** `product:update` |
| `POST` | `/api/v1/products/:id/images` | Authenticated | Creator **OR** `product:update` |
| `DELETE` | `/api/v1/products/:id/images/:imageId` | Authenticated | Creator **OR** `product:update` |
| `PUT` | `/api/v1/products/:id/images/reorder` | Authenticated | Creator **OR** `product:update` |

---

## Endpoint Details

### 1. List Products (Public)
Retrieve a paginated, filterable list of catalog products.

- **Method**: `GET`
- **URL**: `/api/v1/products`
- **Access**: Public

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `search` | `string` | No | - | Search by product name or description |
| `categoryId` | `UUID` | No | - | Filter by category ID |
| `brandId` | `UUID` | No | - | Filter by brand ID |
| `status` | `enum` | No | - | `DRAFT`, `ACTIVE`, `ARCHIVED` (Ignored for public customers) |
| `isFeatured` | `boolean` | No | - | Filter featured products (`true` / `false`) |
| `includeArchived`| `boolean` | No | `false` | Include archived items (Staff only) |
| `page` | `integer` | No | `1` | Page number (Min: 1) |
| `limit` | `integer` | No | `20` | Items per page (Min: 1, Max: 100) |
| `cursor` | `string` | No | - | Cursor for keyset pagination |
| `sortBy` | `enum` | No | `createdAt` | `name`, `createdAt`, `updatedAt`, `status` |
| `sortOrder` | `enum` | No | `desc` | `asc` or `desc` |

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "items": [
      {
        "id": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
        "name": "Nike Air Max Pulse",
        "slug": "nike-air-max-pulse",
        "description": "Premium running shoes with responsive cushioning.",
        "status": "ACTIVE",
        "isFeatured": true,
        "categoryId": "33333333-3333-3333-3333-333333333333",
        "brandId": "22222222-2222-2222-2222-222222222222",
        "category": { "id": "33333333-3333-3333-3333-333333333333", "name": "Footwear", "slug": "footwear" },
        "brand": { "id": "22222222-2222-2222-2222-222222222222", "name": "Nike", "slug": "nike" },
        "images": [
          {
            "id": "e1234567-89ab-4cde-8f01-23456789abcd",
            "url": "https://ik.imagekit.io/your_id/product-1.jpg",
            "altText": "Front view",
            "sortOrder": 0
          }
        ],
        "variantsCount": 4,
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-02T12:30:00.000Z"
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

### 2. Get Product by ID (Public)
Retrieve detailed product information, categories, brand, images, and variants by UUID.

- **Method**: `GET`
- **URL**: `/api/v1/products/:id`
- **Access**: Public

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `UUID` | Yes | Product UUID |

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product retrieved successfully",
  "data": {
    "id": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
    "name": "Nike Air Max Pulse",
    "slug": "nike-air-max-pulse",
    "description": "Premium running shoes with responsive cushioning.",
    "status": "ACTIVE",
    "isFeatured": true,
    "seoTitle": "Nike Air Max Pulse - Official Store",
    "seoDescription": "Buy the latest Nike Air Max Pulse with authentic warranty.",
    "categoryId": "33333333-3333-3333-3333-333333333333",
    "brandId": "22222222-2222-2222-2222-222222222222",
    "category": { "id": "33333333-3333-3333-3333-333333333333", "name": "Footwear", "slug": "footwear" },
    "brand": { "id": "22222222-2222-2222-2222-222222222222", "name": "Nike", "slug": "nike", "logoUrl": "https://ik.imagekit.io/nike-logo.png" },
    "images": [
      {
        "id": "e1234567-89ab-4cde-8f01-23456789abcd",
        "url": "https://ik.imagekit.io/your_id/product-1.jpg",
        "altText": "Front View",
        "sortOrder": 0
      }
    ],
    "variants": [
      {
        "id": "99999999-9999-9999-9999-999999999999",
        "sku": "NK-AMP-BLK-10",
        "title": "Black / US 10",
        "price": 149.99,
        "compareAtPrice": 179.99,
        "inventoryQuantity": 25
      }
    ]
  }
}
```

---

### 3. Get Product by Slug (Public)
Retrieve detailed product by its URL-friendly slug.

- **Method**: `GET`
- **URL**: `/api/v1/products/slug/:slug`
- **Access**: Public

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slug` | `string` | Yes | Unique URL slug (e.g. `nike-air-max-pulse`) |

#### Response (`200 OK`)
*(Same schema structure as `GET /:id`)*

---

### 4. Create Product (Admin/Manager)
Creates a new product in `DRAFT` status (or specified status) with creator tracking.

- **Method**: `POST`
- **URL**: `/api/v1/products`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: `product:create`

#### Request Body (`application/json`)

| Field | Type | Required | Default | Validation / Constraints |
|---|---|---|---|---|
| `name` | `string` | Yes | - | Min 1, Max 200 characters |
| `slug` | `string` | No | Auto-generated | Lowercase alphanumeric + hyphens (Max 220) |
| `description` | `string \| null` | No | `null` | Max 10,000 characters |
| `categoryId` | `UUID \| null` | No | `null` | Valid Category UUID |
| `brandId` | `UUID \| null` | No | `null` | Valid Brand UUID |
| `status` | `enum` | No | `DRAFT` | `DRAFT`, `ACTIVE`, `ARCHIVED` |
| `isFeatured` | `boolean` | No | `false` | Flag for homepage/featured showcase |
| `seoTitle` | `string \| null` | No | `null` | Max 70 characters |
| `seoDescription` | `string \| null` | No | `null` | Max 160 characters |
| `images` | `array` | No | `[]` | Array of image objects: `[{ url, altText?, sortOrder?, fileId? }]` |

#### Example Request
```json
{
  "name": "Sony WH-1000XM5",
  "slug": "sony-wh-1000xm5-wireless-headphones",
  "description": "Industry-leading noise canceling headphones with dual processors.",
  "categoryId": "11111111-1111-1111-1111-111111111111",
  "brandId": "22222222-2222-2222-2222-222222222222",
  "status": "DRAFT",
  "isFeatured": true,
  "seoTitle": "Sony WH-1000XM5 Noise Canceling Headphones",
  "seoDescription": "Experience exceptional sound quality with Sony WH-1000XM5.",
  "images": [
    {
      "url": "https://ik.imagekit.io/store/sony-xm5-front.jpg",
      "altText": "Sony XM5 Black",
      "sortOrder": 0
    }
  ]
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "name": "Sony WH-1000XM5",
    "slug": "sony-wh-1000xm5-wireless-headphones",
    "status": "DRAFT",
    "createdById": "user-uuid-1234",
    "createdAt": "2026-09-07T15:10:00.000Z"
  }
}
```

---

### 5. Update Product (Creator/Admin)
Updates general product details, categorization, and SEO metadata.

- **Method**: `PATCH`
- **URL**: `/api/v1/products/:id`
- **Access**: Authenticated (`Bearer <token>`)
- **Permission**: Product Creator **OR** `product:update`

#### Path Parameters
- `id` (`UUID`): Product ID to update.

#### Request Body (`application/json`)
*(At least one field is required)*

```json
{
  "name": "Sony WH-1000XM5 (Updated)",
  "isFeatured": false,
  "seoTitle": "Best Noise Canceling Headphones - Sony WH-1000XM5"
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "name": "Sony WH-1000XM5 (Updated)",
    "isFeatured": false,
    "updatedAt": "2026-09-07T15:15:00.000Z"
  }
}
```

---

### 6. Publish Product (Creator/Admin)
Transitions the product status to `ACTIVE`, making it visible to public storefronts.

- **Method**: `POST`
- **URL**: `/api/v1/products/:id/publish`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product published successfully",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "status": "ACTIVE"
  }
}
```

---

### 7. Revert to Draft (Creator/Admin)
Reverts product status to `DRAFT` to temporarily unpublish it from public listing.

- **Method**: `POST`
- **URL**: `/api/v1/products/:id/draft`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product moved to draft successfully",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "status": "DRAFT"
  }
}
```

---

### 8. Archive Product (Creator/Admin)
Moves product to `ARCHIVED` status.

- **Method**: `POST`
- **URL**: `/api/v1/products/:id/archive`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product archived successfully",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "status": "ARCHIVED"
  }
}
```

---

### 9. Delete Product (Creator/Admin)
Soft-deletes (archives) or permanently deletes a product and its associated variants and images.

- **Method**: `DELETE`
- **URL**: `/api/v1/products/:id`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:delete`

#### Query Parameters
- `permanent` (`boolean`, optional): Pass `?permanent=true` for permanent hard deletion.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product deleted permanently",
  "data": {
    "id": "a3bb8899-4444-4321-bcde-555555555555",
    "permanent": true
  }
}
```

---

### 10. Get ImageKit Client Auth (Authenticated)
Generates client-side security credentials for direct browser uploads to ImageKit.

- **Method**: `GET`
- **URL**: `/api/v1/products/images/auth`
- **Access**: Authenticated

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "ImageKit auth parameters generated successfully",
  "data": {
    "token": "d9823f98-941d-4001-9c88-e21e86ba2839",
    "expire": 1725712345,
    "signature": "e5b22b620b728cd6945a0b5f137e3d23f46f3689"
  }
}
```

---

### 11. Upload Product Image (Creator/Admin)
Uploads an image via **multipart/form-data** OR **JSON base64/URL payload** to ImageKit and attaches it to the product.

- **Method**: `POST`
- **URL**: `/api/v1/products/:id/images/upload`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Mode A: Multipart Upload (`multipart/form-data`)
- `file` (`File` binary): The image file.
- `altText` (`string`, optional): Accessibility caption.
- `sortOrder` (`integer`, optional): Display ordering.

#### Mode B: JSON Payload (`application/json`)
```json
{
  "file": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA...",
  "fileName": "product-hero.png",
  "altText": "Side view",
  "sortOrder": 1
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product image uploaded successfully to ImageKit",
  "data": {
    "id": "e1234567-89ab-4cde-8f01-23456789abcd",
    "productId": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
    "url": "https://ik.imagekit.io/store/products/c73bcdcc_1725712000.png",
    "fileId": "64fe1234a9b8cd7ef0123456",
    "altText": "Side view",
    "sortOrder": 1
  }
}
```

---

### 12. Attach Existing Image URL (Creator/Admin)
Attaches an already hosted image URL directly to a product's gallery.

- **Method**: `POST`
- **URL**: `/api/v1/products/:id/images`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Request Body (`application/json`)
```json
{
  "url": "https://cdn.example.com/products/headphones-angle.jpg",
  "altText": "Angle profile",
  "sortOrder": 2
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product image added successfully",
  "data": {
    "id": "f5555555-5555-5555-5555-555555555555",
    "productId": "c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd",
    "url": "https://cdn.example.com/products/headphones-angle.jpg",
    "altText": "Angle profile",
    "sortOrder": 2
  }
}
```

---

### 13. Delete Product Image (Creator/Admin)
Deletes a gallery image from a product and purges it from ImageKit if it was uploaded there.

- **Method**: `DELETE`
- **URL**: `/api/v1/products/:id/images/:imageId`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Path Parameters
- `id` (`UUID`): Product ID.
- `imageId` (`UUID`): Image record ID.

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product image deleted successfully",
  "data": {
    "deletedImageId": "f5555555-5555-5555-5555-555555555555"
  }
}
```

---

### 14. Reorder Product Images (Creator/Admin)
Batch updates the gallery display sort order for product images.

- **Method**: `PUT`
- **URL**: `/api/v1/products/:id/images/reorder`
- **Access**: Authenticated
- **Permission**: Product Creator **OR** `product:update`

#### Request Body (`application/json`)
```json
{
  "images": [
    { "id": "e1234567-89ab-4cde-8f01-23456789abcd", "sortOrder": 0 },
    { "id": "f5555555-5555-5555-5555-555555555555", "sortOrder": 1 }
  ]
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Product images reordered successfully",
  "data": [
    { "id": "e1234567-89ab-4cde-8f01-23456789abcd", "sortOrder": 0 },
    { "id": "f5555555-5555-5555-5555-555555555555", "sortOrder": 1 }
  ]
}
```

---

## Standard Response Format

All responses adhere to the standard server response contract:

### Success Response
```json
{
  "success": true,
  "message": "Human readable status message",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Validation failed / Not Found / Forbidden",
  "requestId": "req_01M1XJ...",
  "errors": [
    {
      "field": "name",
      "message": "Product name is required"
    }
  ]
}
```

---

## Error Handling

| Status Code | Reason | Example Cause |
|---|---|---|
| `400 Bad Request` | Zod Validation failure | Missing required fields, invalid UUID format, unrecognized keys |
| `401 Unauthorized` | Missing / invalid token | Expired or missing `Authorization: Bearer <token>` |
| `403 Forbidden` | Insufficient permissions | Not the product creator AND lacks required permission |
| `404 Not Found` | Resource not found | Product ID or slug does not exist |
| `409 Conflict` | Unique constraint violation | Duplicate product slug already exists in database |
