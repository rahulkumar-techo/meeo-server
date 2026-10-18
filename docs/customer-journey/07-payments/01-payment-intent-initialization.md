# 💳 Payment Intent Initialization (Stripe, Razorpay, Mock)

This guide documents initializing customer payments for orders in `PENDING` status across supported payment gateways (**Mock Gateway**, **Stripe**, and **Razorpay**).

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/initialize` | Guest / Authenticated | Initialize payment intent or gateway checkout session |
| `POST` | `/api/v1/payments/webhook/:provider` | Gateway Webhook | Ingest asynchronous webhook payment confirmation |

---

## 1. Initialize Payment Intent

### Request
```http
POST /api/v1/payments/initialize HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "orderId": "ord_01J8R9XYZ998877",
  "provider": "STRIPE",
  "paymentMethod": "CARD",
  "returnUrl": "https://storefront.example.com/checkout/success"
}
```

### Supported Providers:
- `MOCK`: Instant sandbox simulated payments for development.
- `STRIPE`: Generates a Stripe `clientSecret` for Stripe Elements / PaymentSheet.
- `RAZORPAY`: Generates a Razorpay `order_id` for Razorpay Checkout JS modal.

---

### Response `200 OK` (Stripe Provider)
```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "paymentId": "pay_01J8R9QWE112233",
    "orderId": "ord_01J8R9XYZ998877",
    "provider": "STRIPE",
    "amount": 105.28,
    "currency": "USD",
    "status": "PROCESSING",
    "gatewayData": {
      "clientSecret": "pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_YrKJ...",
      "publishableKey": "pk_test_51Mz..."
    }
  }
}
```

### Response `200 OK` (Razorpay Provider)
```json
{
  "success": true,
  "message": "Razorpay order initialized",
  "data": {
    "paymentId": "pay_01J8R9QWE112233",
    "orderId": "ord_01J8R9XYZ998877",
    "provider": "RAZORPAY",
    "amount": 105.28,
    "currency": "USD",
    "status": "PROCESSING",
    "gatewayData": {
      "razorpayOrderId": "order_EKwxoo9GQhDsZr",
      "keyId": "rzp_test_1DP5mmOlF5G5ag"
    }
  }
}
```

---

## 💻 Frontend Stripe Elements Client Example (React)

```tsx
import React, { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

let stripePromise: any = null;

const CheckoutForm = ({ orderId }: { orderId: string }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/confirmation?orderId=${orderId}`,
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-4 border rounded">
      <PaymentElement />
      <button
        disabled={loading || !stripe}
        className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700"
      >
        {loading ? "Processing..." : "Pay Now"}
      </button>
    </form>
  );
};
```
