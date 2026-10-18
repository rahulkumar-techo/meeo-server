# 🛒 Shopping Cart Management

This guide details shopping cart operations for authenticated customers. All cart routes strictly require authentication (`Authorization: Bearer <accessToken>`). Guest users cannot view or add items to the shopping cart without logging in.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Authenticated | Fetch customer shopping cart with item totals and real-time stock |
| `POST` | `/api/v1/cart/items` | Authenticated | Add a product variant to cart (increments if exists) |
| `PATCH` | `/api/v1/cart/items/:itemId` | Authenticated | Update item quantity (setting `0` removes item) |
| `DELETE` | `/api/v1/cart/items/:itemId` | Authenticated | Remove specific item from cart |
| `DELETE` | `/api/v1/cart` | Authenticated | Empty the entire shopping cart |

---

## 🔑 Header Requirements

| Header | Required For | Description |
| :--- | :--- | :--- |
| `Authorization` | All Cart Requests | `Bearer <accessToken>` |

> **Note:** Unauthenticated requests will receive a `401 Unauthorized` response.

---

## 1. Get Active Shopping Cart

Retrieves the current user's cart with calculated subtotals, item discounts, currency, and stock check alerts.

### Request
```http
GET /api/v1/cart HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "cart_01J8R9QWE5566",
    "userId": "usr_01J8R9XYZ8877",
    "currency": "INR",
    "itemCount": 2,
    "subtotal": 150000,
    "items": [
      {
        "id": "cart_item_01",
        "variantId": "var_cyan_sz10_01",
        "quantity": 1,
        "unitPrice": 150000,
        "compareAtPrice": 179000,
        "lineTotal": 150000,
        "stockInfo": {
          "availableQuantity": 14,
          "isAvailable": true
        },
        "variant": {
          "id": "var_cyan_sz10_01",
          "sku": "RUN-SHOE-CYAN-10",
          "price": 150000,
          "compareAtPrice": 179000,
          "attributes": { "color": "Cyan", "size": "10" },
          "product": {
            "id": "prod_01",
            "name": "Ultra-light Performance Running Shoes",
            "slug": "ultra-light-performance-running-shoes",
            "images": ["https://assets.example.com/products/shoes.jpg"]
          }
        }
      }
    ]
  }
}
```

---

## 2. Add Item to Cart

Adds a chosen product variant. If the variant is already present in the cart, the quantity is automatically incremented up to the maximum available stock.

### Request
```http
POST /api/v1/cart/items HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "variantId": "var_cyan_sz10_01",
  "quantity": 1
}
```

### Response `201 Created`
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "id": "cart_01J8R9QWE5566",
    "userId": "usr_01J8R9XYZ8877",
    "summary": {
      "itemCount": 1,
      "totalItems": 1,
      "subtotal": 150000,
      "currency": "INR"
    },
    "items": [
      {
        "id": "cart_item_01",
        "variantId": "var_cyan_sz10_01",
        "quantity": 1,
        "unitPrice": 150000,
        "lineTotal": 150000
      }
    ]
  }
}
```

### Error Responses
- `400 Bad Request`: Requested quantity exceeds available inventory.
- `401 Unauthorized`: Missing or invalid authentication token.
- `404 Not Found`: Variant ID does not exist or is inactive.

---

## 3. Update Item Quantity

Updates the quantity for a specific item in the cart. Passing `quantity: 0` deletes the item.

### Request
```http
PATCH /api/v1/cart/items/cart_item_01 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "quantity": 2
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Cart item updated successfully",
  "data": {
    "id": "cart_01J8R9QWE5566",
    "summary": {
      "itemCount": 1,
      "totalItems": 2,
      "subtotal": 300000,
      "currency": "INR"
    }
  }
}
```

---

## 4. Remove Item from Cart

### Request
```http
DELETE /api/v1/cart/items/cart_item_01 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Item removed from cart successfully",
  "data": {
    "id": "cart_01J8R9QWE5566",
    "summary": {
      "itemCount": 0,
      "totalItems": 0,
      "subtotal": 0,
      "currency": "INR"
    },
    "items": []
  }
}
```

---

## 5. Clear Entire Cart

### Request
```http
DELETE /api/v1/cart HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Cart cleared successfully"
}
```
