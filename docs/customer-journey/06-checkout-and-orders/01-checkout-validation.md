# 🧾 Pre-Checkout Breakdown & Validation

Before finalizing order placement, clients call the `/validate-checkout` endpoint. This calculates live canonical pricing, checks inventory availability, calculates taxes and shipping costs, and validates applied coupons without committing any database transaction.

---

## 📋 Endpoint: Validate Checkout Breakdown

### Request
```http
POST /api/v1/orders/validate-checkout HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
x-session-id: guest_sess_01J8R9XYZ
Content-Type: application/json

{
  "cartId": "cart_01J8R9QWE5566",
  "shippingAddress": {
    "recipientName": "Sarah Connor",
    "phone": "+14155552671",
    "addressLine1": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "Oregon",
    "postalCode": "97477",
    "country": "US"
  },
  "couponCode": "SUMMER25",
  "currency": "USD"
}
```

### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "currency": "USD",
    "summary": {
      "itemCount": 2,
      "subtotal": 129.98,
      "discountTotal": 32.50,
      "shippingFee": 0.00,
      "taxTotal": 7.80,
      "grandTotal": 105.28
    },
    "coupon": {
      "code": "SUMMER25",
      "applied": true,
      "discountAmount": 32.50,
      "freeShippingApplied": true
    },
    "items": [
      {
        "variantId": "var_cyan_sz10_01",
        "productTitle": "Ultra-light Performance Running Shoes",
        "quantity": 1,
        "unitPrice": 99.99,
        "lineTotal": 99.99,
        "isAvailable": true,
        "currentStock": 14
      },
      {
        "variantId": "var_socks_blk_01",
        "productTitle": "Breathable Running Socks (3-Pack)",
        "quantity": 2,
        "unitPrice": 14.99,
        "lineTotal": 29.98,
        "isAvailable": true,
        "currentStock": 50
      }
    ],
    "stockIssues": []
  }
}
```

### Response `400 Bad Request` (Stock Alert / Pricing Discrepancy)
```json
{
  "success": false,
  "statusCode": 400,
  "error": "INSUFFICIENT_STOCK",
  "message": "Some items in your cart have stock issues.",
  "data": {
    "isValid": false,
    "stockIssues": [
      {
        "variantId": "var_cyan_sz10_01",
        "productTitle": "Ultra-light Performance Running Shoes",
        "requestedQuantity": 20,
        "availableStock": 14
      }
    ]
  }
}
```
