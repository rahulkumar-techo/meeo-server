# Real-Time WebSocket Architecture (`src/sockets/`)

This document details the real-time event distribution and WebSocket architecture for the e-commerce platform.

---

## 1. System Architecture & Information Flow

```
                      ┌────────────────────────┐
                      │   PostgreSQL Database  │
                      │    (Source of Truth)   │
                      └───────────┬────────────┘
                                  │
                           ACID Transaction
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │ Transactional Outbox   │
                      └───────────┬────────────┘
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │  BullMQ / Background   │
                      │         Worker         │
                      └───────────┬────────────┘
                                  │
                         Business Domain Event
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │     Redis Pub/Sub      │
                      │ (Horizontal Broadcast) │
                      └───────────┬────────────┘
                                  │
                                  ▼
                      ┌────────────────────────┐
                      │    API Socket Server   │
                      │       (Socket.io)      │
                      └───────────┬────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Customer   │          │  Live Order  │          │    Admin     │
│   Private    │          │   Tracking   │          │  Dashboard   │
│   Room       │          │   Room       │          │  Streams     │
│ user:{userId}│          │order:{orderId│          │  admin:*     │
└──────────────┘          └──────────────┘          └──────────────┘
```

---

## 2. Queue (BullMQ) vs. Pub/Sub (Redis)

| Capability | BullMQ Queue | Redis Pub/Sub |
|---|---|---|
| **Primary Purpose** | Asynchronous job execution & retries | Real-time lightweight event distribution |
| **Delivery Model** | Point-to-point (One worker processes each job) | Fan-out broadcast (All socket nodes receive) |
| **Persistence** | Persistent until job completes / DLQ | Ephemeral (in-memory pub/sub) |
| **Typical Use Cases** | Sending emails, PDF invoices, Image optimization, Payment reconciliation | Live order status changes, Low stock badges, Payment confirmation toasts |

---

## 3. Core Architectural Principle: Socket is NOT the Source of Truth

> [!IMPORTANT]
> WebSockets are an ephemeral real-time notification mechanism, **not a replacement for database state**.

### The Reconnect Fallback Pattern:
1. Client establishes WebSocket on app launch.
2. If network disconnects $\rightarrow$ UI detects disconnect.
3. On reconnect $\rightarrow$ Client makes a fresh REST/GraphQL request (`GET /api/orders/:id`) to re-sync full state.
4. Client listens to incoming socket events to update UI reactively without polling.

---

## 4. Socket Rooms & Access Control

Rooms ensure that users and administrators only receive events they are authorized to see.

| Room Name | Scope | Authorization Required |
|---|---|---|
| `user:{userId}` | Private user notifications & updates | Automatically assigned upon JWT handshake |
| `order:{orderId}` | Live updates for a specific order | Order owner OR users with `order:read` / `ADMIN` |
| `admin` | System-wide admin events | `ADMIN` role, `SUPER_ADMIN`, or `system:manage` |
| `admin:orders` | Real-time new order stream | `ADMIN` or `order:read` |
| `admin:inventory` | Low-stock & inventory alerts | `ADMIN` or `inventory:read` |
| `admin:payments` | Real-time payment reconciliation stream | `ADMIN` or `payment:read` |

---

## 5. Domain Business Events Catalog

Only semantic business events are emitted (never raw table rows).

### Order Events (`order.*`)
* `order.created`: New order placed.
* `order.confirmed`: Payment verified, order confirmed.
* `order.processing`: Warehouse packing items.
* `order.shipped`: Carrier tracking assigned.
* `order.delivered`: Order completed.
* `order.cancelled`: Order cancelled.

### Payment Events (`payment.*`)
* `payment.processing`: Webhook processing.
* `payment.success`: Payment captured.
* `payment.failed`: Card rejected or expired.
* `payment.refunded`: Refund credited.

### Inventory Events (`inventory.*`)
* `inventory.low`: SKU stock dropped below minimum threshold.
* `inventory.restocked`: Stock replenished.

### Notification Events (`notification.*`)
* `notification.created`: Direct customer message or alert.

---

## 6. Client Integration Examples

### A. Customer: Live Order Tracking (React / Next.js)

```tsx
import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export function OrderTracker({ orderId, token }: { orderId: string; token: string }) {
  const [orderStatus, setOrderStatus] = useState<string>("PENDING");

  useEffect(() => {
    // 1. Connect with JWT Access Token
    const socket: Socket = io("https://api.yourdomain.com", {
      path: "/socket.io",
      auth: { token: `Bearer ${token}` },
      transports: ["websocket"],
    });

    // 2. Join the specific order tracking room
    socket.on("system.connect_success", () => {
      socket.emit("join:order", orderId, (response: { success: boolean }) => {
        if (response.success) console.log(`Subscribed to order:${orderId}`);
      });
    });

    // 3. Listen for order status transitions
    socket.on("order.shipped", (payload) => {
      setOrderStatus("SHIPPED");
      console.log("Tracking update:", payload.data);
    });

    socket.on("order.delivered", () => {
      setOrderStatus("DELIVERED");
    });

    return () => {
      socket.emit("leave:order", orderId);
      socket.disconnect();
    };
  }, [orderId, token]);

  return <div>Current Status: <strong>{orderStatus}</strong></div>;
}
```

---

### B. Admin Dashboard: Real-Time Orders & Inventory Alerts

```tsx
import { useEffect } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner"; // or any toast library

export function useAdminRealtimeStream(adminToken: string) {
  useEffect(() => {
    const socket = io("https://api.yourdomain.com", {
      path: "/socket.io",
      auth: { token: `Bearer ${adminToken}` },
    });

    socket.on("system.connect_success", () => {
      // Subscribe to all admin streams
      socket.emit("join:admin", "all");
    });

    // New Order Toast
    socket.on("order.created", ({ data }) => {
      toast.success(`New Order #${data.orderNumber} (₹${data.totalAmount})`);
    });

    // Low Stock Alert
    socket.on("inventory.low", ({ data }) => {
      toast.warning(`Low Stock: ${data.productName} (${data.currentStock} left)`);
    });

    // Payment Success
    socket.on("payment.success", ({ data }) => {
      toast.info(`Payment Captured: ₹${data.amount}`);
    });

    return () => {
      socket.emit("leave:admin");
      socket.disconnect();
    };
  }, [adminToken]);
}
```

---

## 7. Server-Side Publishing Helpers

Whenever you need to push a real-time event from backend services or workers:

```ts
import { emitToUser, emitToOrder, emitToAdmin } from "@/sockets/socket.server.js";
import { SOCKET_EVENTS } from "@/sockets/socket.events.js";

// Emit to a specific user (their private toast / notification)
await emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_CREATED, {
  notificationId: "notif-123",
  title: "Order Shipped",
  message: "Your package is on the way!",
});

// Emit to an active order tracking room
await emitToOrder(orderId, SOCKET_EVENTS.ORDER_SHIPPED, {
  orderId,
  status: "SHIPPED",
  trackingNumber: "TRK-987654",
  updatedAt: new Date().toISOString(),
});

// Emit to admin dashboard
await emitToAdmin("orders", SOCKET_EVENTS.ORDER_CREATED, {
  orderId,
  orderNumber: "ORD-10052",
  totalAmount: 2499,
  userId,
  updatedAt: new Date().toISOString(),
});
```
