import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { Redis } from "ioredis";
import redis from "@/lib/redis.js";
import { socketAuthMiddleware } from "./socket.auth.js";
import { SOCKET_ROOMS, canJoinAdminRoom, canJoinOrderRoom } from "./socket.rooms.js";
import { SOCKET_EVENTS, createSocketPayload, type SocketEventType } from "./socket.events.js";
import { prisma } from "@/lib/prisma.js";

export const REDIS_REALTIME_CHANNEL = "ecommerce:realtime:events";

interface RedisPubSubMessage {
    targetRoom: string;
    event: SocketEventType;
    data: unknown;
}

let ioInstance: SocketIOServer | null = null;
let redisSubscriber: Redis | null = null;

/**
 * Initializes the Socket.io server and bridges it with Redis Pub/Sub.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
    if (ioInstance) {
        return ioInstance;
    }

    const allowedOrigins = process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
        : [
              "http://localhost:3000",
              "http://localhost:5173",
              "http://127.0.0.1:3000",
              "http://127.0.0.1:5173",
              "https://meeo-dashboard.vercel.app",
          ];

    ioInstance = new SocketIOServer(httpServer, {
        path: "/socket.io",
        cors: {
            origin: allowedOrigins,
            credentials: true,
            methods: ["GET", "POST"],
        },
        transports: ["websocket", "polling"],
        pingInterval: 25000,
        pingTimeout: 20000,
    });

    // 1. Attach JWT Authentication Middleware
    ioInstance.use(socketAuthMiddleware);

    // 2. Handle Client Connections & Room Subscriptions
    ioInstance.on("connection", (socket: Socket) => {
        const user = socket.data.user;
        if (!user) {
            socket.disconnect(true);
            return;
        }

        // Automatically join the user's private personal room
        const userRoom = SOCKET_ROOMS.USER(user.userId);
        socket.join(userRoom);

        // Notify client of successful connection
        socket.emit(
            SOCKET_EVENTS.CONNECT_SUCCESS,
            createSocketPayload(SOCKET_EVENTS.CONNECT_SUCCESS, {
                userId: user.userId,
                email: user.email,
                rooms: [userRoom],
            }),
        );

        // Event: Customer subscribes to live tracking for a specific order
        socket.on("join:order", async (orderId: string, callback?: (res: { success: boolean; error?: string }) => void) => {
            try {
                if (!orderId || typeof orderId !== "string") {
                    callback?.({ success: false, error: "Invalid orderId" });
                    return;
                }

                // Verify order ownership if not an admin
                const isSuperAdminOrAdmin = canJoinAdminRoom(user, "order:read");
                if (!isSuperAdminOrAdmin) {
                    const order = await prisma.order.findUnique({
                        where: { id: orderId },
                        select: { userId: true },
                    });

                    if (!order || !order.userId || !canJoinOrderRoom(user, order.userId)) {
                        callback?.({ success: false, error: "Unauthorized to track this order" });
                        return;
                    }
                }

                const orderRoom = SOCKET_ROOMS.ORDER(orderId);
                socket.join(orderRoom);
                callback?.({ success: true });
            } catch (err) {
                callback?.({ success: false, error: "Failed to join order room" });
            }
        });

        // Event: Customer leaves order tracking
        socket.on("leave:order", (orderId: string) => {
            if (orderId && typeof orderId === "string") {
                socket.leave(SOCKET_ROOMS.ORDER(orderId));
            }
        });

        // Event: Admin console subscribes to admin streams (orders, inventory, payments)
        socket.on("join:admin", (channel: "all" | "orders" | "inventory" | "payments" = "all", callback?: (res: { success: boolean; error?: string }) => void) => {
            const hasAccess = canJoinAdminRoom(user);
            if (!hasAccess) {
                callback?.({ success: false, error: "Forbidden: Admin privileges required" });
                return;
            }

            if (channel === "orders" || channel === "all") socket.join(SOCKET_ROOMS.ADMIN_ORDERS);
            if (channel === "inventory" || channel === "all") socket.join(SOCKET_ROOMS.ADMIN_INVENTORY);
            if (channel === "payments" || channel === "all") socket.join(SOCKET_ROOMS.ADMIN_PAYMENTS);
            socket.join(SOCKET_ROOMS.ADMIN);

            callback?.({ success: true });
        });

        // Event: Admin console leaves admin streams
        socket.on("leave:admin", () => {
            socket.leave(SOCKET_ROOMS.ADMIN);
            socket.leave(SOCKET_ROOMS.ADMIN_ORDERS);
            socket.leave(SOCKET_ROOMS.ADMIN_INVENTORY);
            socket.leave(SOCKET_ROOMS.ADMIN_PAYMENTS);
        });
    });

    // 3. Setup Redis Pub/Sub Subscriber for Horizontal Scaling
    setupRedisSubscriber();

    return ioInstance;
}

/**
 * Initializes the Redis subscriber client to distribute events across multiple server instances.
 */
function setupRedisSubscriber(): void {
    if (redisSubscriber || !process.env.REDIS_URL) {
        return;
    }

    try {
        redisSubscriber = redis.duplicate();

        redisSubscriber.subscribe(REDIS_REALTIME_CHANNEL, (err) => {
            if (err) {
                console.error("[Socket Redis Pub/Sub] Subscription error:", err.message);
            }
        });

        redisSubscriber.on("message", (channel, message) => {
            if (channel !== REDIS_REALTIME_CHANNEL || !ioInstance) return;

            try {
                const parsed: RedisPubSubMessage = JSON.parse(message);
                const payload = createSocketPayload(parsed.event, parsed.data);
                ioInstance.to(parsed.targetRoom).emit(parsed.event, payload);
            } catch (err) {
                console.error("[Socket Redis Pub/Sub] Failed to parse message:", err);
            }
        });
    } catch (err) {
        console.warn("[Socket Redis Pub/Sub] Subscriber setup skipped (Redis unavailable)");
    }
}

/**
 * Gets the current Socket.io server instance.
 */
export function getSocketServer(): SocketIOServer | null {
    return ioInstance;
}

/**
 * Publishes a real-time event to a target room.
 * Delivers locally to connected sockets and publishes to Redis Pub/Sub for other cluster instances.
 */
export async function publishRealtimeEvent<T>(
    targetRoom: string,
    event: SocketEventType,
    data: T,
): Promise<void> {
    const payload = createSocketPayload(event, data);

    // 1. Deliver to locally connected clients in this instance
    if (ioInstance) {
        ioInstance.to(targetRoom).emit(event, payload);
    }

    // 2. Publish to Redis Pub/Sub for other backend instances
    try {
        if (redis.status === "ready" || redis.status === "connect") {
            const message: RedisPubSubMessage = {
                targetRoom,
                event,
                data,
            };
            await redis.publish(REDIS_REALTIME_CHANNEL, JSON.stringify(message));
        }
    } catch {
        // Fallback: local delivery already completed
    }
}

/**
 * Convenience helper: Send event to a specific user.
 */
export async function emitToUser<T>(userId: string, event: SocketEventType, data: T): Promise<void> {
    return publishRealtimeEvent(SOCKET_ROOMS.USER(userId), event, data);
}

/**
 * Convenience helper: Send event to a specific order room.
 */
export async function emitToOrder<T>(orderId: string, event: SocketEventType, data: T): Promise<void> {
    return publishRealtimeEvent(SOCKET_ROOMS.ORDER(orderId), event, data);
}

/**
 * Convenience helper: Send event to the admin dashboard stream.
 */
export async function emitToAdmin<T>(
    target: "orders" | "inventory" | "payments" | "all",
    event: SocketEventType,
    data: T,
): Promise<void> {
    let room: string = SOCKET_ROOMS.ADMIN;
    if (target === "orders") room = SOCKET_ROOMS.ADMIN_ORDERS;
    if (target === "inventory") room = SOCKET_ROOMS.ADMIN_INVENTORY;
    if (target === "payments") room = SOCKET_ROOMS.ADMIN_PAYMENTS;

    return publishRealtimeEvent(room, event, data);
}

/**
 * Gracefully terminates the Socket server and closes Redis subscriptions.
 */
export async function closeSocketServer(): Promise<void> {
    if (redisSubscriber) {
        try {
            await redisSubscriber.unsubscribe(REDIS_REALTIME_CHANNEL);
            await redisSubscriber.quit();
        } catch {
            // Ignore shutdown errors
        }
        redisSubscriber = null;
    }

    if (ioInstance) {
        await new Promise<void>((resolve) => {
            ioInstance?.close(() => resolve());
        });
        ioInstance = null;
    }
}
