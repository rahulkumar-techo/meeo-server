# Admin Dashboard & Executive Analytics Module Documentation

> **Base Route**: `/api/v1/admin/dashboard`  
> **Route Definition**: [`src/modules/dashboard/routes/dashboard.route.ts`](file:///e:/e-com/server/src/modules/dashboard/routes/dashboard.route.ts)  
> **Controller**: [`src/modules/dashboard/controller/dashboard.controller.ts`](file:///e:/e-com/server/src/modules/dashboard/controller/dashboard.controller.ts)  
> **Service**: [`src/modules/dashboard/services/dashboard.service.ts`](file:///e:/e-com/server/src/modules/dashboard/services/dashboard.service.ts)  
> **Validation Schemas**: [`src/modules/dashboard/validations/dashboard.validation.ts`](file:///e:/e-com/server/src/modules/dashboard/validations/dashboard.validation.ts)  
> **Executive Analytics Guide**: [`ADMIN_ANALYTICS.README.md`](file:///e:/e-com/server/src/modules/dashboard/ADMIN_ANALYTICS.README.md)

---

## Table of Contents

1. [System Architecture & Analytics Ingestion](#system-architecture--analytics-ingestion)
2. [Net GMV Velocity (30D) & Financial Metrics](#net-gmv-velocity-30d--financial-metrics)
3. [E-Commerce Conversion Funnel Throughput](#e-commerce-conversion-funnel-throughput)
4. [Channel GMV Distribution & Omnichannel Share](#channel-gmv-distribution--omnichannel-share)
5. [Endpoints Summary](#endpoints-summary)
6. [Endpoint Specifications & Scenarios](#endpoint-specifications--scenarios)
   - [1. Executive Overview KPIs (`GET /overview`)](#1-executive-overview-kpis-get-overview)
   - [2. Time-Series Sales & Revenue Trends (`GET /sales-chart`)](#2-time-series-sales--revenue-trends-get-sales-chart)
   - [3. Top-Selling Products Leaderboard (`GET /top-sellers`)](#3-top-selling-products-leaderboard-get-top-sellers)
   - [4. Low-Stock Reorder Velocity Alerts (`GET /low-stock`)](#4-low-stock-reorder-velocity-alerts-get-low-stock)
   - [5. Failed Payment Triage (`GET /failed-payments`)](#5-failed-payment-triage-get-failed-payments)
   - [6. Operational Backlog Health (`GET /health`)](#6-operational-backlog-health-get-health)
7. [Flow & Architecture Diagrams](#flow--architecture-diagrams)
8. [Frontend React / Next.js Integration](#frontend-react--nextjs-integration)
9. [Error Codes & Diagnostics](#error-codes--diagnostics)

---

## System Architecture & Analytics Ingestion

The Dashboard & Analytics engine aggregates transactions across **Orders**, **Payments**, **Inventory**, **Users**, and **Promotions** into structured executive insights.

### Core Metrics Handled

- **Financial Analytics**: Gross Merchandise Value (GMV), Net GMV, 30-Day GMV Velocity, Average Order Value (AOV), Discount Subsidies, Refund Losses.
- **Conversion Funnel Throughput**: User Registration $\to$ Product Views $\to$ Add to Cart $\to$ Checkout Initiations $\to$ Orders Confirmed $\to$ Deliveries Fulfilled.
- **Omnichannel Distribution**: Web Desktop vs Mobile Web vs Mobile Native App share, Stripe vs Razorpay vs COD payment distribution.
- **Supply Chain & Inventory Health**: Real-time SKU stock levels, reorder threshold alerts, and stockout prevention.
- **Operational Backlog**: Review moderation queues, unfulfilled orders, and failed payment triage.

---

## Net GMV Velocity (30D) & Financial Metrics

$$\text{Net GMV 30D Velocity} = \frac{\text{Gross Revenue}_{30\text{D}} - \text{Discounts}_{30\text{D}} - \text{Refunds}_{30\text{D}}}{30 \text{ Days}}$$

$$\text{AOV (Average Order Value)} = \frac{\text{Gross Revenue}}{\text{Completed Orders Count}}$$

---

## E-Commerce Conversion Funnel Throughput

```
┌────────────────────────────────────────────────────────┐
│ 1. User Registrations / Unique Visitors (100.0%)       │
└───────────────────────────┬────────────────────────────┘
                            │ (55% pass rate)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Product Catalog Views & Searches (55.0%)            │
└───────────────────────────┬────────────────────────────┘
                            │ (40% pass rate)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Add to Cart Actions (22.0%)                         │
└───────────────────────────┬────────────────────────────┘
                            │ (60% pass rate)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Checkout Initiated & Shipping Selection (13.2%)     │
└───────────────────────────┬────────────────────────────┘
                            │ (85% pass rate)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 5. Payment Authorized & Order Confirmed (11.2%)        │
└───────────────────────────┬────────────────────────────┘
                            │ (98% pass rate)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 6. Order Fulfilled & Shipped (11.0%)                   │
└────────────────────────────────────────────────────────┘
```

---

## Channel GMV Distribution & Omnichannel Share

- **Client Platform Split**:
  - `WEB_DESKTOP`: 45% ($65,650.73)
  - `MOBILE_WEB`: 35% ($51,061.68)
  - `MOBILE_APP`: 20% ($29,178.09)
- **Payment Method Split**:
  - `STRIPE` (Cards, Apple Pay, Google Pay): 68.5%
  - `RAZORPAY` (UPI, Netbanking, Wallets): 26.5%
  - `COD` (Cash on Delivery): 5.0%

---

## Endpoints Summary

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/dashboard/overview` | `dashboard:read` | Executive summary (Net GMV, Velocity, Orders, Funnel, Users, Inventory) |
| `GET` | `/api/v1/admin/dashboard/sales-chart` | `dashboard:read` | Time-series sales trend points (daily/weekly/monthly) |
| `GET` | `/api/v1/admin/dashboard/top-sellers` | `dashboard:read` | Best-selling products ranked by units sold and gross revenue |
| `GET` | `/api/v1/admin/dashboard/low-stock` | `dashboard:read` | Inventory reorder velocity alerts |
| `GET` | `/api/v1/admin/dashboard/failed-payments` | `dashboard:read` | Failed payment logs with gateway reason codes |
| `GET` | `/api/v1/admin/dashboard/health` | `dashboard:read` | Operational backlog health (outbox, reviews, fulfillment) |

---

## Endpoint Specifications & Scenarios

---

### 1. Executive Overview KPIs (`GET /overview`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/overview?period=30d`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

#### Response (`200 OK`)
```json
{
  "success": true,
  "status": "success",
  "data": {
    "period": "30d",
    "financials": {
      "grossRevenue": 145890.50,
      "netRevenue": 134250.25,
      "netGmv30DVelocity": 4475.01,
      "totalDiscounts": 7840.25,
      "totalRefunds": 3800.00,
      "currency": "USD",
      "averageOrderValue": 118.23
    },
    "orders": {
      "totalOrders": 1234,
      "confirmed": 1050,
      "delivered": 980,
      "processing": 45,
      "pending": 25,
      "cancelled": 74,
      "refunded": 40
    },
    "conversionFunnel": {
      "registeredUsers": 4850,
      "newSignupsInPeriod": 620,
      "cartAdditions": 2840,
      "checkoutInitiated": 1520,
      "ordersPlaced": 1234,
      "ordersDelivered": 980,
      "overallConversionRatePercent": 25.44
    },
    "channelDistribution": {
      "omnichannelShare": [
        { "channel": "WEB_DESKTOP", "sharePercent": 45.0, "gmv": 65650.73 },
        { "channel": "MOBILE_WEB", "sharePercent": 35.0, "gmv": 51061.68 },
        { "channel": "MOBILE_APP", "sharePercent": 20.0, "gmv": 29178.09 }
      ],
      "paymentGateways": [
        { "provider": "STRIPE", "sharePercent": 68.5, "transactionCount": 845 },
        { "provider": "RAZORPAY", "sharePercent": 26.5, "transactionCount": 327 },
        { "provider": "COD", "sharePercent": 5.0, "transactionCount": 62 }
      ]
    },
    "users": {
      "totalUsers": 4850,
      "active": 4720,
      "suspended": 90,
      "blocked": 40,
      "newInPeriod": 620
    },
    "inventory": {
      "totalSkus": 450,
      "inStockSkus": 418,
      "lowStockSkus": 24,
      "outOfStockSkus": 8
    },
    "payments": {
      "totalAttempts": 1420,
      "successfulAttempts": 1234,
      "failedAttempts": 186,
      "failureRatePercent": 13.1
    },
    "reviews": {
      "totalReviews": 3420,
      "pendingModeration": 18,
      "averageRating": 4.65
    },
    "promotions": {
      "activeCoupons": 8,
      "totalDiscountGranted": 7840.25
    },
    "generatedAt": "2026-09-08T14:45:00.000Z"
  }
}
```

---

### 2. Time-Series Sales & Revenue Trends (`GET /sales-chart`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/sales-chart?period=30d&interval=day`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

---

### 3. Top-Selling Products Leaderboard (`GET /top-sellers`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/top-sellers?limit=10&period=30d`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

---

### 4. Low-Stock Reorder Velocity Alerts (`GET /low-stock`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/low-stock?threshold=10&page=1&limit=20`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

---

### 5. Failed Payment Triage (`GET /failed-payments`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/failed-payments?page=1&limit=20`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

---

### 6. Operational Backlog Health (`GET /health`)

- **Method**: `GET`
- **URL**: `/api/v1/admin/dashboard/health`
- **Permission**: `dashboard:read` or `SUPER_ADMIN`

---

## Flow & Architecture Diagrams

### Executive Financial Reconciliation Flow

```mermaid
flowchart TD
    Orders[Completed Orders Gross Total: $145,890.50] --> Discount[Promotional Coupons Applied: -$7,840.25]
    Discount --> Refund[Settled Refunds & Returns: -$3,800.00]
    Refund --> Net[Net GMV (30D): $134,250.25]
    Net --> Velocity[30-Day Velocity Run Rate: $4,475.01 / day]
```

---

## Frontend React / Next.js Integration

```tsx
import { useState, useEffect } from "react";

export function ExecutiveAnalyticsDashboard() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/v1/admin/dashboard/overview?period=${period}`)
      .then((res) => res.json())
      .then((json) => setData(json.data));
  }, [period]);

  return (
    <div className="analytics-page">
      {/* 1. Net GMV Velocity Hero Banner */}
      <div className="hero-banner">
        <h2>Net GMV 30D Velocity: ${data?.financials.netGmv30DVelocity.toLocaleString()} / day</h2>
        <p>Total Net GMV ({period}): ${data?.financials.netRevenue.toLocaleString()}</p>
        <p>AOV: ${data?.financials.averageOrderValue.toFixed(2)}</p>
      </div>

      {/* 2. Conversion Funnel Progress Cards */}
      <div className="funnel-grid">
        <div className="funnel-step">Signups: {data?.conversionFunnel.newSignupsInPeriod}</div>
        <div className="funnel-step">Add to Cart: {data?.conversionFunnel.cartAdditions}</div>
        <div className="funnel-step">Checkouts: {data?.conversionFunnel.checkoutInitiated}</div>
        <div className="funnel-step">Orders: {data?.conversionFunnel.ordersPlaced}</div>
        <div className="funnel-step">Conversion: {data?.conversionFunnel.overallConversionRatePercent}%</div>
      </div>

      {/* 3. Omnichannel Share Breakdown */}
      <div className="omnichannel-list">
        {data?.channelDistribution.omnichannelShare.map((ch: any) => (
          <div key={ch.channel}>
            <span>{ch.channel}: {ch.sharePercent}%</span>
            <span>(${ch.gmv.toLocaleString()})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Error Codes & Diagnostics

| HTTP Status | Error Type | Solution |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Ensure `period` is one of `"today"`, `"7d"`, `"30d"`, `"90d"`, `"1y"`, `"all"` |
| `401 Unauthorized` | `UNAUTHENTICATED` | Provide Bearer token |
| `403 Forbidden` | `FORBIDDEN` | Requires `dashboard:read` permission or `SUPER_ADMIN` role |
