# 🛒 Catalog, Attributes & Variants — Client Dashboard Integration Guide

> **Target Audience**: Frontend / Admin Dashboard Developers  
> **Base API URL**: `http://localhost:5000/api/v1`  
> **Auth Required**: `Authorization: Bearer <accessToken>` (for mutations)

---

## 📌 Architecture at a Glance

```
1. Master Pool (/attributes)        ➔ Colors [Red, Blue], Sizes [M, L, XL]
2. Product (/products)              ➔ "Nike Air Max Pulse" (Parent container)
3. Product Variants (/products/:id/variants) ➔ "Nike Air Max - Red / Size M" ($149.99, Stock: 50)
```

---

## 🚀 The 3-Step Dashboard Workflow

---

### 🟢 STEP 1: Fetch Master Attributes for UI Dropdowns
When the admin opens the "Create/Edit Product" page, load all available master options (Color, Size, Material, etc.) to populate dropdowns or tag selectors.

- **Endpoint**: `GET /api/v1/attributes`
- **Access**: Public

#### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "attr-color-uuid",
        "name": "Color",
        "values": [
          { "id": "val-red-uuid", "value": "Red" },
          { "id": "val-blue-uuid", "value": "Blue" },
          { "id": "val-black-uuid", "value": "Black" }
        ]
      },
      {
        "id": "attr-size-uuid",
        "name": "Size",
        "values": [
          { "id": "val-m-uuid", "value": "M" },
          { "id": "val-l-uuid", "value": "L" },
          { "id": "val-xl-uuid", "value": "XL" }
        ]
      }
    ]
  }
}
```

> **Note**: If the admin types a *new* color (e.g. "Purple"), you can append it via `PATCH /api/v1/attributes/attr-color-uuid` with `{"values": ["Purple"]}`.

---

### 🟢 STEP 2: Create the Parent Product
Create the basic product details (Title, Description, Category, Brand, Images).

- **Endpoint**: `POST /api/v1/products`
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "name": "Nike Air Max Pulse",
  "categoryId": "category-uuid-123",
  "brandId": "brand-uuid-456",
  "description": "High-performance running shoe with dynamic cushioning.",
  "status": "DRAFT",
  "isFeatured": true
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "prod_101_uuid",
    "name": "Nike Air Max Pulse",
    "slug": "nike-air-max-pulse",
    "status": "DRAFT"
  }
}
```

---

### 🟢 STEP 3: Associate Variants & Attributes with the Product
Now, create the actual physical variants for `prod_101_uuid` and attach the selected attribute values.

#### Option A: Batch Create All Variant Combinations (Recommended)
When the admin selects `[Red, Blue]` and `[M, L]`, generate the 4 matrix rows and submit in one request:

- **Endpoint**: `POST /api/v1/products/prod_101_uuid/variants/batch`
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`

#### Request Body
```json
{
  "variants": [
    {
      "sku": "NK-AMP-RED-M",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "initialStock": 30,
      "attributeValueIds": ["val-red-uuid", "val-m-uuid"]
    },
    {
      "sku": "NK-AMP-RED-L",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "initialStock": 25,
      "attributeValueIds": ["val-red-uuid", "val-l-uuid"]
    },
    {
      "sku": "NK-AMP-BLU-M",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "initialStock": 20,
      "attributeValueIds": ["val-blue-uuid", "val-m-uuid"]
    },
    {
      "sku": "NK-AMP-BLU-L",
      "price": 149.99,
      "compareAtPrice": 179.99,
      "initialStock": 15,
      "attributeValueIds": ["val-blue-uuid", "val-l-uuid"]
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
    "count": 4,
    "variants": [
      { "id": "var-1-uuid", "sku": "NK-AMP-RED-M", "price": 149.99, "status": "ACTIVE" },
      { "id": "var-2-uuid", "sku": "NK-AMP-RED-L", "price": 149.99, "status": "ACTIVE" },
      { "id": "var-3-uuid", "sku": "NK-AMP-BLU-M", "price": 149.99, "status": "ACTIVE" },
      { "id": "var-4-uuid", "sku": "NK-AMP-BLU-L", "price": 149.99, "status": "ACTIVE" }
    ]
  }
}
```

#### Option B: Single Variant Create
- **Endpoint**: `POST /api/v1/products/:productId/variants`
```json
{
  "sku": "NK-AMP-RED-XL",
  "price": 159.99,
  "initialStock": 10,
  "attributeValueIds": ["val-red-uuid", "val-xl-uuid"]
}
```

---

### 🟢 STEP 4: Publish the Product
Once images and variants are set, publish the product to make it active on the customer storefront.

- **Endpoint**: `POST /api/v1/products/prod_101_uuid/publish`
- **Response**: `200 OK` (Status updated to `ACTIVE`)

---

## 📱 Fetching Product Data for Dashboard / Storefront

### 1. Get Product with all Variants & Attributes
`GET /api/v1/products/:productId`

```json
{
  "success": true,
  "data": {
    "id": "prod_101_uuid",
    "name": "Nike Air Max Pulse",
    "status": "ACTIVE",
    "variants": [
      {
        "id": "var-1-uuid",
        "sku": "NK-AMP-RED-M",
        "price": 149.99,
        "attributeValues": [
          { "attributeValue": { "id": "val-red-uuid", "value": "Red", "attribute": { "name": "Color" } } },
          { "attributeValue": { "id": "val-m-uuid", "value": "M", "attribute": { "name": "Size" } } }
        ]
      }
    ]
  }
}
```

### 2. Get Grouped Active Attributes for this Product
`GET /api/v1/products/:productId/attributes`

```json
{
  "success": true,
  "data": [
    {
      "id": "attr-color-uuid",
      "name": "Color",
      "values": [
        { "id": "val-red-uuid", "value": "Red" },
        { "id": "val-blue-uuid", "value": "Blue" }
      ]
    },
    {
      "id": "attr-size-uuid",
      "name": "Size",
      "values": [
        { "id": "val-m-uuid", "value": "M" },
        { "id": "val-l-uuid", "value": "L" }
      ]
    }
  ]
}
```

---

## ✏️ Managing & Editing Existing Variants

| Action | HTTP Method | Endpoint | Request Body |
|---|---|---|---|
| **Edit Price / Stock / SKU** | `PATCH` | `/api/v1/variants/:variantId` | `{ "price": 139.99, "barcode": "012345" }` |
| **Change Variant Attributes** | `PATCH` | `/api/v1/variants/:variantId` | `{ "attributeValueIds": ["new-val-uuid"] }` |
| **Delete Single Variant** | `DELETE` | `/api/v1/variants/:variantId` | *None* |
| **List Product Variants** | `GET` | `/api/v1/products/:productId/variants` | `?page=1&limit=20` |

---

## 💻 React / TypeScript Dashboard Implementation Example

```typescript
import axios from "axios";

const API = axios.create({ baseURL: "http://localhost:5000/api/v1" });

// 1. Fetch Master Attributes list
export async function getMasterAttributes() {
  const { data } = await API.get("/attributes");
  return data.data.items;
}

// 2. Create Product
export async function createProduct(productData: any, token: string) {
  const { data } = await API.post("/products", productData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data; // returns { id: "prod_xxx" }
}

// 3. Batch Create Variants with Selected Attributes
export async function createProductVariants(productId: string, variantsList: any[], token: string) {
  const { data } = await API.post(`/products/${productId}/variants/batch`, {
    variants: variantsList,
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data;
}

// 4. Publish Product
export async function publishProduct(productId: string, token: string) {
  const { data } = await API.post(`/products/${productId}/publish`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data;
}
```
