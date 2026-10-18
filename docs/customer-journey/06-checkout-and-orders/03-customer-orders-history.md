# 📦 Customer Order History & Self-Service Cancellation

Customers can list their past orders, inspect granular order status progressions, view delivery receipts, and cancel eligible pending orders before warehouse fulfillment starts.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | Authenticated | List customer's orders with pagination & status filter |
| `GET` | `/api/v1/orders/:id` | Authenticated | Get full details of an order by UUID |
| `GET` | `/api/v1/orders/number/:orderNumber` | Authenticated | Get order details by human-friendly Order Number |
| `POST` | `/api/v1/orders/:id/cancel` | Authenticated | Cancel pending order & release inventory hold |

---

## 1. List Customer Orders

### Request
```http
GET /api/v1/orders?page=1&limit=10&status=CONFIRMED HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "ord_01J8R9XYZ998877",
      "orderNumber": "ORD-20260912-7891",
      "status": "CONFIRMED",
      "paymentStatus": "PAID",
      "totalAmount": 105.28,
      "itemCount": 2,
      "createdAt": "2026-09-12T07:24:00.000Z",
      "itemsPreview": [
        {
          "title": "Ultra-light Performance Running Shoes",
          "quantity": 1,
          "thumbnailUrl": "https://assets.example.com/products/running-shoes-cyan-1.jpg"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalOrders": 14,
    "totalPages": 2
  }
}
```

---

## 2. Get Single Order Details by ID

### Request
```http
GET /api/v1/orders/ord_01J8R9XYZ998877 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "ord_01J8R9XYZ998877",
    "orderNumber": "ORD-20260912-7891",
    "status": "CONFIRMED",
    "paymentStatus": "PAID",
    "currency": "USD",
    "subtotal": 129.98,
    "discountAmount": 32.50,
    "shippingFee": 0.00,
    "taxAmount": 7.80,
    "totalAmount": 105.28,
    "createdAt": "2026-09-12T07:24:00.000Z",
    "shippingAddress": {
      "recipientName": "Sarah Connor",
      "phone": "+14155552671",
      "addressLine1": "742 Evergreen Terrace",
      "city": "Springfield",
      "state": "Oregon",
      "postalCode": "97477",
      "country": "US"
    },
    "items": [
      {
        "id": "ord_item_01",
        "variantId": "var_cyan_sz10_01",
        "title": "Ultra-light Performance Running Shoes",
        "variantTitle": "Cyan / Size 10",
        "sku": "RUN-SHOE-CYAN-10",
        "unitPrice": 99.99,
        "quantity": 1,
        "totalPrice": 99.99
      }
    ],
    "statusHistory": [
      {
        "status": "PENDING",
        "timestamp": "2026-09-12T07:24:00.000Z",
        "note": "Order placed by customer"
      },
      {
        "status": "CONFIRMED",
        "timestamp": "2026-09-12T07:24:45.000Z",
        "note": "Payment verified via Stripe"
      }
    ],
    "tracking": {
      "carrier": null,
      "trackingNumber": null,
      "trackingUrl": null
    }
  }
}
```

---

## 3. Customer Cancel Order

Customers can cancel orders if the status is currently `PENDING` or `CONFIRMED` (before warehouse picks and sets to `PROCESSING` or `SHIPPED`).

### Request
```http
POST /api/v1/orders/ord_01J8R9XYZ998877/cancel HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "reason": "Ordered wrong size by mistake"
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Order successfully cancelled and inventory reservation released",
  "data": {
    "orderId": "ord_01J8R9XYZ998877",
    "status": "CANCELLED",
    "refundInitiated": true
  }
}
```
