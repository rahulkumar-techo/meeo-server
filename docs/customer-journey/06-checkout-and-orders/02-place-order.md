# 💳 Place Order & Atomic Checkout

This guide details the atomic order placement process. The system guarantees transactional safety, locks stock via temporary inventory reservations, freezes canonical pricing and delivery addresses, clears the cart, and prepares the order for payment gateway processing.

---

## 🛡️ Key Transaction Guarantees

1. **Idempotency**: All clients **MUST** supply an `Idempotency-Key` header (UUID) to prevent double charges on duplicate clicks or network retries.
2. **Stock Reservation**: Inventory is temporarily reserved for 15 minutes while awaiting payment confirmation.
3. **Data Snapshots**: Complete product titles, variant attributes, prices, and address fields are snapshotted on the order records so future catalog edits never alter historical invoices.

---

## 📋 Endpoint: Order Placement

### Request
```http
POST /api/v1/orders/checkout HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
x-session-id: guest_sess_01J8R9XYZ
Idempotency-Key: 7f3b89b4-02c3-4d45-9a88-1a2b3c4d5e6f
Content-Type: application/json

{
  "cartId": "cart_01J8R9QWE5566",
  "shippingAddressId": "addr_01J8R9QWE9001",
  "couponCode": "SUMMER25",
  "notes": "Please leave at front door if no answer.",
  "currency": "USD"
}
```

### Response `201 Created`
```json
{
  "success": true,
  "message": "Order placed successfully. Awaiting payment.",
  "data": {
    "order": {
      "id": "ord_01J8R9XYZ998877",
      "orderNumber": "ORD-20260912-7891",
      "status": "PENDING",
      "paymentStatus": "PENDING",
      "currency": "USD",
      "subtotal": 129.98,
      "discountAmount": 32.50,
      "shippingFee": 0.00,
      "taxAmount": 7.80,
      "totalAmount": 105.28,
      "createdAt": "2026-09-12T07:24:00.000Z",
      "expiresAt": "2026-09-12T07:39:00.000Z",
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
          "quantity": 1,
          "unitPrice": 99.99,
          "totalPrice": 99.99
        }
      ]
    },
    "nextStep": {
      "action": "INITIALIZE_PAYMENT",
      "endpoint": "/api/v1/payments/initialize",
      "orderId": "ord_01J8R9XYZ998877"
    }
  }
}
```

---

## ⚡ React Checkout Flow Integration

```tsx
import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";

export const PlaceOrderButton: React.FC<{ shippingAddressId: string; couponCode?: string }> = ({
  shippingAddressId,
  couponCode,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleCheckout = async () => {
    setSubmitting(true);
    const token = localStorage.getItem("accessToken");
    const idempotencyKey = uuidv4();

    try {
      const res = await fetch("http://localhost:5000/api/v1/orders/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ shippingAddressId, couponCode }),
      });

      const json = await res.json();
      if (json.success) {
        // Direct customer to Payment Initialization
        window.location.href = `/checkout/pay?orderId=${json.data.order.id}`;
      } else {
        alert(`Order placement failed: ${json.message}`);
      }
    } catch (err) {
      console.error("Order error", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={submitting}
      className="bg-black text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 disabled:opacity-50"
    >
      {submitting ? "Placing Order..." : "Place Order & Pay"}
    </button>
  );
};
```
