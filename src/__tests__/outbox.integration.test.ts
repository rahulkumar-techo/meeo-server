import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "outbox-test-jwt-secret";

const { outboxServiceMock, authPrismaMock } = vi.hoisted(() => ({
    outboxServiceMock: {
        listOutboxEvents: vi.fn(),
        getOutboxEventById: vi.fn(),
        pollAndPublishBatch: vi.fn(),
        retryFailedEvent: vi.fn(),
        getOutboxMetrics: vi.fn(),
        listProcessedEvents: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/outbox/services/outbox.service.js", () => ({
    outboxService: outboxServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import outboxRouter from "../modules/outbox/routes/outbox.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Outbox & Events HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(outboxRouter, { prefix: "/api/outbox" });
        return app;
    };

    const mockAdminUser = () => {
        const userId = "admin-user-uuid-1111-2222-333344445555";
        const sessionId = "session-uuid-1111-2222-333344445555";
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

    it("requires authentication for outbox inspection endpoints", async () => {
        const app = await createTestApp();

        const response = await app.inject({
            method: "GET",
            url: "/api/outbox/events",
        });

        expect(response.statusCode).toBe(401);
    });

    it("lists outbox events with filters and pagination via GET /api/outbox/events", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        outboxServiceMock.listOutboxEvents.mockResolvedValue({
            items: [
                {
                    id: "e5033c46-95e3-4d22-b5e1-0bfab4b901a1",
                    eventType: "ORDER_CONFIRMED",
                    status: "PUBLISHED",
                    attempts: 0,
                },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/outbox/events?status=PUBLISHED&page=1&limit=10",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.items).toHaveLength(1);
        expect(outboxServiceMock.listOutboxEvents).toHaveBeenCalledWith(
            expect.objectContaining({ status: "PUBLISHED", page: 1, limit: 10 }),
        );
    });

    it("retrieves outbox event by ID via GET /api/outbox/events/:id", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();
        const eventId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        outboxServiceMock.getOutboxEventById.mockResolvedValue({
            id: eventId,
            eventType: "PAYMENT_SUCCESS",
            aggregateType: "Payment",
            status: "PENDING",
        });

        const response = await app.inject({
            method: "GET",
            url: `/api/outbox/events/${eventId}`,
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.id).toBe(eventId);
        expect(outboxServiceMock.getOutboxEventById).toHaveBeenCalledWith(eventId);
    });

    it("triggers batch publishing cycle via POST /api/outbox/publish-now", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        outboxServiceMock.pollAndPublishBatch.mockResolvedValue({
            claimedCount: 5,
            publishedCount: 5,
            failedCount: 0,
            deadLetteredCount: 0,
        });

        const response = await app.inject({
            method: "POST",
            url: "/api/outbox/publish-now",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: {
                batchSize: 50,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.publishedCount).toBe(5);
        expect(outboxServiceMock.pollAndPublishBatch).toHaveBeenCalledWith(50);
    });

    it("manually retries a failed outbox event via POST /api/outbox/events/:id/retry", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();
        const eventId = "e5033c46-95e3-4d22-b5e1-0bfab4b901a1";

        outboxServiceMock.retryFailedEvent.mockResolvedValue({
            id: eventId,
            status: "PENDING",
            attempts: 0,
        });

        const response = await app.inject({
            method: "POST",
            url: `/api/outbox/events/${eventId}/retry`,
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe("success");
        expect(body.data.status).toBe("PENDING");
        expect(outboxServiceMock.retryFailedEvent).toHaveBeenCalledWith(eventId);
    });

    it("retrieves outbox & queue metrics via GET /api/outbox/metrics", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        outboxServiceMock.getOutboxMetrics.mockResolvedValue({
            outbox: { pending: 3, processing: 0, published: 120, failed: 1, total: 124 },
            queues: { domainEvents: { waiting: 1 }, deadLetter: { waiting: 0 } },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/outbox/metrics",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.outbox.total).toBe(124);
    });

    it("lists processed events audit records via GET /api/outbox/processed", async () => {
        const app = await createTestApp();
        const { token } = mockAdminUser();

        outboxServiceMock.listProcessedEvents.mockResolvedValue({
            items: [
                {
                    id: "p1",
                    eventId: "e5033c46-95e3-4d22-b5e1-0bfab4b901a1",
                    consumerName: "OrderEventsConsumer",
                    status: "COMPLETED",
                },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const response = await app.inject({
            method: "GET",
            url: "/api/outbox/processed?consumerName=OrderEventsConsumer",
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.items).toHaveLength(1);
        expect(outboxServiceMock.listProcessedEvents).toHaveBeenCalledWith(
            expect.objectContaining({ consumerName: "OrderEventsConsumer" }),
        );
    });
});
