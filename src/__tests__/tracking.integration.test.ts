import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe, it, expect, vi, beforeEach } from "vitest";
import trackingRouter from "@/modules/tracking/routes/tracking.route.js";
import user360Router from "@/modules/tracking/routes/user360.route.js";
import { UserEventType } from "@/generated/prisma/enums.js";
import { errorHandler } from "@/common/errors/error-handler.js";

import { AppError } from "@/common/errors/app-error.js";

const { mockIngestion, mockUser360 } = vi.hoisted(() => ({
    mockIngestion: {
        ingestBatch: vi.fn(),
        identifyAndMerge: vi.fn(),
    },
    mockUser360: {
        getUser360: vi.fn(),
        getUserActivity: vi.fn(),
    },
}));

vi.mock("@/modules/tracking/services/trackingIngestion.service.js", () => ({
    trackingIngestionService: mockIngestion,
}));

vi.mock("@/modules/tracking/services/user360.service.js", () => ({
    user360Service: mockUser360,
}));

async function buildTestApp(authenticatedUser: any = null) {
    const app = Fastify();
    await app.register(cookie);
    app.setErrorHandler(errorHandler);

    // Decorate mock auth plugins
    app.decorate("authenticate", async (req: any) => {
        if (!authenticatedUser) {
            throw new AppError("Authentication required", 401);
        }
        req.user = authenticatedUser;
    });

    app.decorate("optionalAuthenticate", async (req: any) => {
        if (authenticatedUser) {
            req.user = authenticatedUser;
        }
    });

    app.decorate("requirePermission", () => async () => {});

    await app.register(trackingRouter, { prefix: "/api/v1/tracking" });
    await app.register(user360Router, { prefix: "/api/v1/track-user" });
    await app.ready();
    return app;
}

describe("Tracking & User 360 HTTP Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("POST /api/v1/tracking/events", () => {
        it("ingests anonymous batch events returning 202 Accepted", async () => {
            mockIngestion.ingestBatch.mockResolvedValue({ ingestedCount: 1 });
            const app = await buildTestApp(null); // anonymous guest

            const response = await app.inject({
                method: "POST",
                url: "/api/v1/tracking/events",
                payload: {
                    events: [
                        {
                            sessionId: "anon-sess-1",
                            event: UserEventType.PRODUCT_VIEWED,
                            entityType: "PRODUCT",
                            entityId: "prod-xyz",
                        },
                    ],
                },
            });

            expect(response.statusCode).toBe(202);
            const json = response.json();
            expect(json.success).toBe(true);
            expect(json.ingestedCount).toBe(1);
        });

        it("rejects invalid event payload with 400 Bad Request", async () => {
            const app = await buildTestApp(null);

            const response = await app.inject({
                method: "POST",
                url: "/api/v1/tracking/events",
                payload: {
                    events: [
                        {
                            event: "INVALID_UNKNOWN_EVENT",
                        },
                    ],
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it("rejects oversized metadata with 400 Bad Request", async () => {
            const app = await buildTestApp(null);

            const response = await app.inject({
                method: "POST",
                url: "/api/v1/tracking/events",
                payload: {
                    events: [
                        {
                            event: UserEventType.PRODUCT_VIEWED,
                            metadata: {
                                hugePayload: "a".repeat(5000), // > 4KB
                            },
                        },
                    ],
                },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /api/v1/tracking/identify", () => {
        it("rejects unauthenticated requests with 401 Unauthorized", async () => {
            const app = await buildTestApp(null);

            const response = await app.inject({
                method: "POST",
                url: "/api/v1/tracking/identify",
                payload: {
                    sessionId: "anon-123",
                },
            });

            expect(response.statusCode).toBe(401);
        });

        it("merges session buffer for authenticated user returning 200 OK", async () => {
            mockIngestion.identifyAndMerge.mockResolvedValue({
                success: true,
                stitchedEvents: 2,
                ingestedBufferedEvents: 1,
            });

            const app = await buildTestApp({ id: "user-1", permissions: [] });

            const response = await app.inject({
                method: "POST",
                url: "/api/v1/tracking/identify",
                payload: {
                    sessionId: "anon-123",
                    events: [
                        { event: UserEventType.CART_ADDED, entityId: "item-1" },
                    ],
                },
            });

            expect(response.statusCode).toBe(200);
            const json = response.json();
            expect(json.success).toBe(true);
            expect(json.stitchedEvents).toBe(2);
        });
    });

    describe("GET /api/v1/track-user/:userId/360", () => {
        it("rejects unauthenticated user 360 queries with 401", async () => {
            const app = await buildTestApp(null);

            const response = await app.inject({
                method: "GET",
                url: "/api/v1/track-user/550e8400-e29b-41d4-a716-446655440000/360",
            });

            expect(response.statusCode).toBe(401);
        });

        it("retrieves pre-aggregated user 360 profile for authenticated user", async () => {
            const targetUuid = "550e8400-e29b-41d4-a716-446655440000";
            mockUser360.getUser360.mockResolvedValue({
                profile: { id: targetUuid, email: "test@example.com" },
                commerce: { totalSpend: 2500, totalOrders: 3 },
            });

            const app = await buildTestApp({ id: targetUuid, permissions: [] });

            const response = await app.inject({
                method: "GET",
                url: `/api/v1/track-user/${targetUuid}/360`,
            });

            expect(response.statusCode).toBe(200);
            const json = response.json();
            expect(json.success).toBe(true);
            expect(json.data.profile.id).toBe(targetUuid);
            expect(json.data.commerce.totalSpend).toBe(2500);
        });
    });
});
