# 🏷️ Coupons, Promo Codes & Discounts

This guide covers validating promotional discount codes, calculating threshold eligibility, verifying maximum usage limits, and reviewing a customer's personal coupon redemption history.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/coupons/validate` | Guest / Authenticated | Check coupon eligibility & preview discount amounts |
| `GET` | `/api/v1/coupons/my-history` | Authenticated | Customer's previous coupon redemption records |

---

## 1. Validate & Preview Coupon Discount

Evaluates discount eligibility without placing an order. Checks date validity, minimum cart spend, per-user usage limits, and category restrictions.

### Request
```http
POST /api/v1/coupons/validate HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "code": "SUMMER25",
  "cartSubtotal": 120.00
}
```

### Response `200 OK` (Valid Coupon)
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "code": "SUMMER25",
    "discountType": "PERCENTAGE",
    "discountValue": 25,
    "discountAmount": 30.00,
    "freeShipping": true,
    "minOrderAmount": 50.00,
    "subtotal": 120.00,
    "finalAmount": 90.00,
    "message": "Coupon applied! You saved $30.00 + Free Shipping."
  }
}
```

### Response `200 OK` (Ineligible / Below Minimum Spend)
```json
{
  "success": true,
  "data": {
    "isValid": false,
    "code": "SUMMER25",
    "message": "Minimum cart spend of $50.00 required for this coupon.",
    "minOrderAmount": 50.00,
    "currentSubtotal": 35.00,
    "shortfall": 15.00
  }
}
```

---

## 2. Customer Coupon Redemption History

### Request
```http
GET /api/v1/coupons/my-history HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "couponCode": "WELCOME10",
      "discountAmount": 15.00,
      "orderId": "ord_01J8R9QWE9900",
      "orderNumber": "ORD-20260901-8812",
      "usedAt": "2026-09-01T14:30:00.000Z"
    }
  ]
}
```
