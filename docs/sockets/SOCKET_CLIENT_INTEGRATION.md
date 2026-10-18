# WebSocket Client Integration Guide
### For Admin Dashboard (`admin-dash`) & Customer Storefront

This guide shows where and how to integrate real-time WebSockets in both the **Admin Dashboard** and the **Customer Storefront**.

---

## Part 1: Admin Dashboard Integration (`admin-dash`)

### 1. File Structure in `admin-dash`
Create or place these files in your frontend project:

```text
admin-dash/src/
├── lib/
│   └── socket.ts                   <-- Singleton Socket client instance
├── context/
│   └── socket-provider.tsx         <-- React Context for Socket lifecycle
├── hooks/
│   ├── use-admin-socket.ts         <-- Hook to listen to admin-wide events
│   └── use-live-orders.ts          <-- Hook for real-time order feed
```

---

### 2. Singleton Socket Client (`src/lib/socket.ts`)

```ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getAdminSocket(accessToken: string): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000", {
      path: "/socket.io",
      auth: { token: `Bearer ${accessToken}` },
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}

export function disconnectAdminSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

---

### 3. Global Socket Provider (`src/context/socket-provider.tsx`)

Wrap your dashboard layout (or `_app.tsx` / `RootLayout`) with the provider:

```tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { getAdminSocket, disconnectAdminSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/use-auth"; // your existing auth hook

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      disconnectAdminSocket();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const s = getAdminSocket(token);
    setSocket(s);

    s.on("connect", () => {
      setIsConnected(true);
      // Join all admin streams (orders, inventory, payments)
      s.emit("join:admin", "all");
    });

    s.on("disconnect", () => {
      setIsConnected(false);
    });

    return () => {
      s.emit("leave:admin");
    };
  }, [isAuthenticated, token]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
```

---

### 4. Admin Dashboard Live Hook (`src/hooks/use-admin-socket.ts`)

Connect live events to TanStack React Query cache invalidation and notification sounds/toasts:

```tsx
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/context/socket-provider";
import { playNotificationSound } from "@/lib/notification-sound"; // your notification sound utility
import { toast } from "sonner"; // or your toast component

export function useAdminSocketEvents() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // 1. New Order Alert
    socket.on("order.created", ({ data }) => {
      playNotificationSound();
      toast.success(`New Order: #${data.orderNumber ?? data.orderId}`, {
        description: `Amount: ₹${data.totalAmount}`,
      });
      // Invalidate orders list query so the table auto-updates
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    });

    // 2. Order Status Changed (e.g. Cancelled, Shipped)
    socket.on("order.cancelled", ({ data }) => {
      toast.error(`Order #${data.orderId} was cancelled`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    });

    // 3. Low Stock Alert
    socket.on("inventory.low", ({ data }) => {
      playNotificationSound();
      toast.warning(`Low Stock Warning: ${data.productName}`, {
        description: `Only ${data.currentStock} units remaining!`,
      });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    });

    // 4. Payment Captured / Refunded
    socket.on("payment.success", ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    });

    socket.on("payment.refunded", ({ data }) => {
      toast.info(`Refund processed for order #${data.orderId}`);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    });

    return () => {
      socket.off("order.created");
      socket.off("order.cancelled");
      socket.off("inventory.low");
      socket.off("payment.success");
      socket.off("payment.refunded");
    };
  }, [socket, isConnected, queryClient]);
}
```

---

## Part 2: Customer Storefront Integration

### 1. Where to Implement in Customer Storefront
* **Header / Navbar:** In-App Notification Bell badge.
* **Order Details Page (`/orders/[id]`):** Real-time order status timeline (Ordered $\rightarrow$ Confirmed $\rightarrow$ Shipped $\rightarrow$ Delivered).
* **Checkout / Payment Success Page:** Live webhook payment confirmation confirmation screen.

---

### 2. Live Order Tracking Component (`src/components/orders/order-tracking-timeline.tsx`)

```tsx
import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

interface OrderTrackingProps {
  orderId: string;
  initialStatus: string;
  customerToken: string;
}

export function OrderTrackingTimeline({ orderId, initialStatus, customerToken }: OrderTrackingProps) {
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const queryClient = useQueryClient();

  useEffect(() => {
    // 1. Establish authenticated socket
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000", {
      path: "/socket.io",
      auth: { token: `Bearer ${customerToken}` },
      transports: ["websocket"],
    });

    // 2. Join the private order tracking room
    socket.on("system.connect_success", () => {
      socket.emit("join:order", orderId, (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.warn("Could not join order room:", response.error);
        }
      });
    });

    // 3. Listen for order status updates
    socket.on("order.confirmed", () => setCurrentStatus("CONFIRMED"));
    socket.on("order.processing", () => setCurrentStatus("PROCESSING"));
    socket.on("order.shipped", ({ data }) => {
      setCurrentStatus("SHIPPED");
      // Invalidate REST query to fetch tracking number & courier details
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    });
    socket.on("order.delivered", () => setCurrentStatus("DELIVERED"));
    socket.on("order.cancelled", () => setCurrentStatus("CANCELLED"));

    // 4. Cleanup on unmount
    return () => {
      socket.emit("leave:order", orderId);
      socket.disconnect();
    };
  }, [orderId, customerToken, queryClient]);

  const steps = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const currentStepIndex = steps.indexOf(currentStatus);

  return (
    <div className="p-6 bg-card rounded-xl border">
      <h3 className="text-lg font-semibold mb-4">Live Order Status: {currentStatus}</h3>
      <div className="flex items-center justify-between">
        {steps.map((step, idx) => {
          const isCompleted = idx <= currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          return (
            <div key={step} className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  isCompleted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                } ${isCurrent ? "ring-4 ring-primary/20 animate-pulse" : ""}`}
              >
                {idx + 1}
              </div>
              <span className="text-xs mt-2">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 3. Customer Header Notification Bell Badge (`src/components/layout/notification-bell.tsx`)

```tsx
import React, { useEffect, useState } from "react";
import { useSocket } from "@/context/socket-provider";
import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [count, setCount] = useState(unreadCount);
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    setCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (!socket) return;

    // Customer automatically belongs to user:{userId} room upon connection
    socket.on("notification.created", () => {
      setCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });

    return () => {
      socket.off("notification.created");
    };
  }, [socket, queryClient]);

  return (
    <div className="relative cursor-pointer">
      <Bell className="w-6 h-6" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-bounce">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}
```

---

## Part 3: Architecture Recap & Best Practices

1. **Reactivity through Cache Invalidation:**
   Instead of replacing your entire state inside socket event listeners, use `queryClient.invalidateQueries(...)`. This ensures your application stays perfectly in sync with PostgreSQL (the single source of truth) while giving instant UI feedback.

2. **Clean Disconnects:**
   Always call `socket.emit("leave:order", orderId)` and `socket.disconnect()` in the `useEffect` cleanup return function to prevent memory leaks and orphaned room subscriptions.

3. **Multi-Tab Synchronization:**
   Because all tabs share the same `user:{userId}` room, actions performed in one tab (e.g. marking a notification read) update all other open tabs in real-time.
