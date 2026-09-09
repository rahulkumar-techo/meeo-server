import { describe, it, expect, vi, beforeEach } from "vitest";
import { SOCKET_EVENTS, createSocketPayload } from "@/sockets/socket.events.js";
import { SOCKET_ROOMS, canJoinAdminRoom, canJoinOrderRoom, type SocketUserContext } from "@/sockets/socket.rooms.js";
import { socketAuthMiddleware } from "@/sockets/socket.auth.js";
import * as tokenUtils from "@/common/utils/token.js";
import * as authCache from "@/common/utils/auth-cache.js";

describe("WebSocket Subsystem Unit Tests", () => {
    describe("socket.events", () => {
        it("creates standardized envelope payload", () => {
            const data = { orderId: "ord-1", status: "CONFIRMED" };
            const payload = createSocketPayload(SOCKET_EVENTS.ORDER_CONFIRMED, data);

            expect(payload.event).toBe(SOCKET_EVENTS.ORDER_CONFIRMED);
            expect(payload.data).toEqual(data);
            expect(typeof payload.timestamp).toBe("string");
            expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
        });
    });

    describe("socket.rooms", () => {
        it("generates correct room names", () => {
            expect(SOCKET_ROOMS.USER("u123")).toBe("user:u123");
            expect(SOCKET_ROOMS.ORDER("ord456")).toBe("order:ord456");
            expect(SOCKET_ROOMS.ADMIN).toBe("admin");
            expect(SOCKET_ROOMS.ADMIN_ORDERS).toBe("admin:orders");
            expect(SOCKET_ROOMS.ADMIN_INVENTORY).toBe("admin:inventory");
            expect(SOCKET_ROOMS.ADMIN_PAYMENTS).toBe("admin:payments");
        });

        it("allows SUPER_ADMIN and system:manage to join admin rooms", () => {
            const superAdmin: SocketUserContext = {
                userId: "s1",
                email: "super@example.com",
                roles: ["SUPER_ADMIN"],
                permissions: ["system:manage"],
            };
            expect(canJoinAdminRoom(superAdmin)).toBe(true);
        });

        it("allows users with specific permission to join admin rooms", () => {
            const orderManager: SocketUserContext = {
                userId: "m1",
                email: "manager@example.com",
                roles: ["ORDER_MANAGER"],
                permissions: ["order:read"],
            };
            expect(canJoinAdminRoom(orderManager, "order:read")).toBe(true);
            expect(canJoinAdminRoom(orderManager, "inventory:read")).toBe(false);
        });

        it("allows customers to join only their own order room", () => {
            const customer: SocketUserContext = {
                userId: "cust-1",
                email: "cust@example.com",
                roles: ["CUSTOMER"],
                permissions: [],
            };

            expect(canJoinOrderRoom(customer, "cust-1")).toBe(true);
            expect(canJoinOrderRoom(customer, "cust-2")).toBe(false);
        });
    });

    describe("socket.auth", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("rejects connection when no token is provided", async () => {
            const mockSocket: any = {
                handshake: {
                    auth: {},
                    headers: {},
                },
                data: {},
            };
            const next = vi.fn();

            await socketAuthMiddleware(mockSocket, next);

            expect(next).toHaveBeenCalledWith(expect.any(Error));
            const error = next.mock.calls[0]?.[0] as Error | undefined;
            expect(error?.message).toContain("Authentication required");
        });

        it("authenticates and attaches user context with valid token", async () => {
            vi.spyOn(tokenUtils, "verifyAccessToken").mockReturnValue({
                userId: "user-123",
                email: "user@example.com",
            });
            vi.spyOn(authCache, "getAuthContext").mockResolvedValue({
                userId: "user-123",
                email: "user@example.com",
                roles: ["CUSTOMER"],
                permissions: ["product:read"],
            });

            const mockSocket: any = {
                handshake: {
                    auth: { token: "valid-jwt-token" },
                    headers: {},
                },
                data: {},
            };
            const next = vi.fn();

            await socketAuthMiddleware(mockSocket, next);

            expect(next).toHaveBeenCalledWith();
            expect(mockSocket.data.user).toEqual({
                userId: "user-123",
                email: "user@example.com",
                roles: ["CUSTOMER"],
                permissions: ["product:read"],
            });
        });
    });
});
