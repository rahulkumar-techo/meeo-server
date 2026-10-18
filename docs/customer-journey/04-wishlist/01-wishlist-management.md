# 💖 Customer Wishlist & Saved Products

The Wishlist allows authenticated customers to bookmark favorite products, track pricing changes, and seamlessly move saved products into their active shopping cart.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/wishlist` | Authenticated | Retrieve customer's saved wishlist products |
| `POST` | `/api/v1/wishlist` | Authenticated | Add product to wishlist via JSON body |
| `POST` | `/api/v1/wishlist/products/:productId` | Authenticated | Add product to wishlist via route parameter |
| `DELETE` | `/api/v1/wishlist/products/:productId` | Authenticated | Remove product from wishlist |
| `POST` | `/api/v1/wishlist/products/:productId/move-to-cart` | Authenticated | Move saved product directly into cart |

---

## 1. Get User Wishlist

### Request
```http
GET /api/v1/wishlist HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "totalItems": 2,
    "items": [
      {
        "id": "wish_item_01",
        "productId": "prod_01J8R9QWE1001",
        "title": "Ultra-light Performance Running Shoes",
        "slug": "ultra-light-performance-running-shoes",
        "thumbnailUrl": "https://assets.example.com/products/running-shoes-thumb.jpg",
        "basePrice": 129.99,
        "salePrice": 99.99,
        "inStock": true,
        "categoryName": "Footwear",
        "brandName": "AeroAthletics",
        "createdAt": "2026-09-12T07:15:00.000Z"
      }
    ]
  }
}
```

---

## 2. Add Product to Wishlist

### Request
```http
POST /api/v1/wishlist/products/prod_01J8R9QWE1001 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Product added to wishlist",
  "data": {
    "productId": "prod_01J8R9QWE1001",
    "totalWishlistCount": 3
  }
}
```

---

## 3. Remove Product from Wishlist

### Request
```http
DELETE /api/v1/wishlist/products/prod_01J8R9QWE1001 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Product removed from wishlist"
}
```

---

## 4. Move Wishlist Item Directly to Cart

Transfers the saved product (or a chosen variant) into the user's active shopping cart and automatically removes it from the wishlist in a single atomic call.

### Request
```http
POST /api/v1/wishlist/products/prod_01J8R9QWE1001/move-to-cart HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "variantId": "var_cyan_sz10_01",
  "quantity": 1
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Product moved to shopping cart",
  "data": {
    "cartItemCount": 4,
    "cartSubtotal": 244.95
  }
}
```
