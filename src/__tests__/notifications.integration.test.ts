import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "notif-test-jwt-secret";

const { notificationDispatcherMock, notificationPreferenceMock, authPrismaMock } = vi.hoisted(() => ({
    notificationDispatcherMock: {
        listUserNotifications: vi.fn(),
        getUnreadCount: vi.fn(),
        markNotificationAsRead: vi.fn(),
        markAllAsRead: vi.fn(),
        deleteNotification: vi.fn(),
        sendManualNotification: vi.fn(),
        retryFailedNotification: vi.fn(),
    },
    notificationPreferenceMock: {
        getUserPreferences: vi.fn(),
        updateUserPreferences: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/notifications/services/notificationDispatcher.service.js", () => ({
    notificationDispatcherService: notificationDispatcherMock,
}));
vi.mock("../modules/notifications/services/notificationPreference.service.js", () => ({
    notificationPreferenceService: notificationPreferenceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import notificationRouter from "../modules/notifications/routes/notification.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Notifications HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(notificationRouter, { prefix: "/api/notifications" });
        return app;
    };

    const mockCustomerUser = () => {
        const userId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";
        const sessionId = "8b51d451-f76a-4933-9fc8-dcab2d61d001";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "buyer@test.com",
            status: "ACTIVE",
            roles: [],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "buyer@test.com",
        });

        return { token, userId };
    };

    const mockAdminUser = () => {
        const userId = "admin-uuid-1111-2222-333344445555";
        const sessionId = "session-admin-uuid-1111-2222";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [{ permission: { name: PERMISSIONS.SYSTEM_MANAGE } }],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            userId,
            expiresAt: new Date(Date.now() + 60000),
            revokedAt: null,
        });

        const token = generateAccessToken({
            userId,
            sessionId,
            email: "admin@store.com",
        });

        return { token, userId };
    };

    it("requires authentication for listing user notifications", async () => {
        const app = await createTestApp();

        const response = await app.inject({
            method: "GET",
            url: "/api/notifications",
        });

        expect(response.statusCode).toBe(401);
    });

    it("retrieves in-app notifications for authenticated user", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        notificationDispatcherMock.listUserNotifications.mockResolvedValue({
            items: [
                {
                    id: "notif-1",
                    type: "ORDER_CONFIRMED",
                    title: "Order Confirmed!",
                    body: "Your order has been confirmed",
                    readAt: null,
                },
            ],
            unreadCount: 1,
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/notifications?unreadOnly=true",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.items).toHaveLength(1);
        expect(notificationDispatcherMock.listUserNotifications).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ unreadOnly: true }),
        );
    });

    it("gets unread notification count via GET /api/notifications/unread-count", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        notificationDispatcherMock.getUnreadCount.mockResolvedValue(3);

        const response = await app.inject({
            method: "GET",
            url: "/api/notifications/unread-count",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.unreadCount).toBe(3);
        expect(notificationDispatcherMock.getUnreadCount).toHaveBeenCalledWith(userId);
    });

    it("marks single notification as read via PATCH /api/notifications/:id/read", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();
        const notifId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        notificationDispatcherMock.markNotificationAsRead.mockResolvedValue({
            id: notifId,
            status: "READ",
            readAt: new Date(),
        });

        const response = await app.inject({
            method: "PATCH",
            url: `/api/notifications/${notifId}/read`,
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.message).toBe("Notification marked as read");
        expect(notificationDispatcherMock.markNotificationAsRead).toHaveBeenCalledWith(userId, notifId);
    });

    it("marks all notifications as read via POST /api/notifications/mark-all-read", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        notificationDispatcherMock.markAllAsRead.mockResolvedValue({ count: 5 });

        const response = await app.inject({
            method: "POST",
            url: "/api/notifications/mark-all-read",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.count).toBe(5);
        expect(notificationDispatcherMock.markAllAsRead).toHaveBeenCalledWith(userId);
    });

    it("retrieves and updates user notification preferences", async () => {
        const app = await createTestApp();
        const { token, userId } = mockCustomerUser();

        notificationPreferenceMock.getUserPreferences.mockResolvedValue({
            userId,
            emailEnabled: true,
            pushEnabled: false,
            inAppEnabled: true,
            orderUpdates: true,
            promotions: false,
        });

        // 1. GET preferences
        const getRes = await app.inject({
            method: "GET",
            url: "/api/notifications/preferences",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(getRes.statusCode).toBe(200);
        expect(getRes.json().data.pushEnabled).toBe(false);

        // 2. PUT preferences
        notificationPreferenceMock.updateUserPreferences.mockResolvedValue({
            userId,
            emailEnabled: true,
            pushEnabled: true,
            inAppEnabled: true,
            orderUpdates: true,
            promotions: true,
        });

        const putRes = await app.inject({
            method: "PUT",
            url: "/api/notifications/preferences",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                pushEnabled: true,
                promotions: true,
            },
        });

        expect(putRes.statusCode).toBe(200);
        expect(notificationPreferenceMock.updateUserPreferences).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ pushEnabled: true, promotions: true }),
        );
    });

    it("allows admin to send targeted or broadcast notifications via POST /api/notifications/send", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        notificationDispatcherMock.sendManualNotification.mockResolvedValue({
            dispatched: true,
            results: [{ channel: "EMAIL", success: true, id: "mail-1" }],
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/notifications/send",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                recipientEmail: "vip@customer.com",
                type: "PROMOTION",
                title: "Flash Sale Alert",
                body: "Get 30% off today only!",
                channels: ["EMAIL"],
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(notificationDispatcherMock.sendManualNotification).toHaveBeenCalledWith(
            expect.objectContaining({ recipientEmail: "vip@customer.com", type: "PROMOTION" }),
        );
    });
});
