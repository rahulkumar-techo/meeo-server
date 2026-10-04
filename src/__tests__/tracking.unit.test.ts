import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackingIngestionService } from "@/modules/tracking/services/trackingIngestion.service.js";
import { userBehaviourAggregationService } from "@/modules/tracking/services/userBehaviourAggregation.service.js";
import { user360Service } from "@/modules/tracking/services/user360.service.js";
import { prisma } from "@/lib/prisma.js";
import redis from "@/lib/redis.js";
import { UserEventType, UserInterestType } from "@/generated/prisma/enums.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        userEvent: {
            createMany: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        userBehaviorSummary: {
            upsert: vi.fn(),
            findUnique: vi.fn(),
        },
        userInterest: {
            upsert: vi.fn(),
            findMany: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
        order: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/redis.js", () => ({
    default: {
        status: "ready",
        set: vi.fn(),
        get: vi.fn(),
    },
}));

vi.mock("@/modules/audit/services/auditLog.service.js", () => ({
    auditLogService: {
        recordLog: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
}));

describe("User Behaviour Tracking & User 360 Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("TrackingIngestionService", () => {
        it("ingests batch of events with deduplication", async () => {
            (redis.set as any).mockResolvedValue("OK");
            (prisma.userEvent.createMany as any).mockResolvedValue({ count: 2 });

            const result = await trackingIngestionService.ingestBatch({
                userId: "user-uuid-1",
                sessionId: "session-123",
                events: [
                    {
                        clientEventId: "client-evt-1",
                        event: UserEventType.PRODUCT_VIEWED,
                        entityType: "PRODUCT",
                        entityId: "prod-101",
                    },
                    {
                        clientEventId: "client-evt-2",
                        event: UserEventType.CART_ADDED,
                        entityType: "PRODUCT",
                        entityId: "prod-101",
                    },
                ],
            });

            expect(result.ingestedCount).toBe(2);
            expect(prisma.userEvent.createMany).toHaveBeenCalledTimes(1);
        });

        it("filters out duplicate events when idempotency key already exists in Redis", async () => {
            // First call returns "OK", second returns null (key exists)
            (redis.set as any)
                .mockResolvedValueOnce("OK")
                .mockResolvedValueOnce(null);

            (prisma.userEvent.createMany as any).mockResolvedValue({ count: 1 });

            const result = await trackingIngestionService.ingestBatch({
                userId: "user-uuid-1",
                events: [
                    { clientEventId: "evt-new", event: UserEventType.PRODUCT_VIEWED },
                    { clientEventId: "evt-dup", event: UserEventType.PRODUCT_VIEWED },
                ],
            });

            expect(result.ingestedCount).toBe(1);
        });

        it("stitches anonymous session to authenticated user on login", async () => {
            (redis.set as any).mockResolvedValue("OK");
            (prisma.userEvent.createMany as any).mockResolvedValue({ count: 1 });
            (prisma.userEvent.updateMany as any).mockResolvedValue({ count: 3 });

            const result = await trackingIngestionService.identifyAndMerge({
                userId: "user-uuid-1",
                sessionId: "anon-session-abc",
                bufferedEvents: [
                    { event: UserEventType.PRODUCT_VIEWED, entityType: "PRODUCT", entityId: "p1" },
                ],
            });

            expect(result.success).toBe(true);
            expect(result.stitchedEvents).toBe(3);
            expect(result.ingestedBufferedEvents).toBe(1);
            expect(prisma.userEvent.updateMany).toHaveBeenCalledWith({
                where: { sessionId: "anon-session-abc", userId: null },
                data: { userId: "user-uuid-1" },
            });
        });
    });

    describe("UserBehaviourAggregationService", () => {
        it("aggregates events and upserts summary and interest scores", async () => {
            (redis.get as any).mockResolvedValue(null);
            (redis.set as any).mockResolvedValue("OK");

            const now = new Date();
            (prisma.userEvent.findMany as any).mockResolvedValue([
                {
                    id: "evt-1",
                    userId: "u-1",
                    event: UserEventType.PRODUCT_VIEWED,
                    entityType: "PRODUCT",
                    entityId: "prod-nike",
                    createdAt: now,
                },
                {
                    id: "evt-2",
                    userId: "u-1",
                    event: UserEventType.CART_ADDED,
                    entityType: "PRODUCT",
                    entityId: "prod-nike",
                    createdAt: now,
                },
            ]);

            (prisma.userBehaviorSummary.upsert as any).mockResolvedValue({});
            (prisma.userInterest.upsert as any).mockResolvedValue({});

            const result = await userBehaviourAggregationService.processBatch(100);

            expect(result.processedCount).toBe(2);
            expect(result.affectedUsers).toBe(1);
            expect(prisma.userBehaviorSummary.upsert).toHaveBeenCalledTimes(1);
            expect(prisma.userInterest.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId_type_entityId: {
                            userId: "u-1",
                            type: UserInterestType.PRODUCT,
                            entityId: "prod-nike",
                        },
                    },
                }),
            );
        });

        it("purges raw events older than retention days", async () => {
            (prisma.userEvent.deleteMany as any).mockResolvedValue({ count: 150 });

            const purged = await userBehaviourAggregationService.purgeOldEvents(60);

            expect(purged).toBe(150);
            expect(prisma.userEvent.deleteMany).toHaveBeenCalled();
        });
    });

    describe("User360Service", () => {
        const mockTargetUser = {
            id: "u-100",
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            phone: "+1234567890",
            status: "ACTIVE",
            createdAt: new Date(),
            lastLoginAt: new Date(),
        };

        it("returns full 360 profile for user viewing their own account", async () => {
            (prisma.user.findUnique as any).mockResolvedValue(mockTargetUser);
            (prisma.userBehaviorSummary.findUnique as any).mockResolvedValue({
                productViews: 10,
                cartAdds: 2,
                checkoutStarted: 1,
                paymentSuccess: 1,
            });
            (prisma.userInterest.findMany as any).mockResolvedValue([
                { type: "CATEGORY", entityId: "electronics", score: 25 },
            ]);
            (prisma.order.findMany as any).mockResolvedValue([
                {
                    id: "ord-1",
                    orderNumber: "ORD-001",
                    status: "DELIVERED",
                    grandTotal: 1500,
                    createdAt: new Date(),
                    items: [{ quantity: 2 }],
                },
            ]);
            (prisma.userEvent.findMany as any).mockResolvedValue([]);

            const result = await user360Service.getUser360("u-100", {
                userId: "u-100",
                permissions: [],
            });

            expect(result.profile.email).toBe("john@example.com");
            expect(result.commerce?.totalOrders).toBe(1);
            expect(result.commerce?.totalSpend).toBe(1500);
            expect(result.insights?.funnel?.viewToCartPercent).toBe(20);
        });

        it("redacts commerce and insights sections if staff member lacks permissions", async () => {
            (prisma.user.findUnique as any).mockResolvedValue(mockTargetUser);
            (prisma.userBehaviorSummary.findUnique as any).mockResolvedValue(null);
            (prisma.userEvent.findMany as any).mockResolvedValue([]);

            const result = await user360Service.getUser360("u-100", {
                userId: "staff-999",
                permissions: [PERMISSIONS.USER_360_VIEW], // Has general 360 view, but lacks commerce/insights
            });

            expect(result.profile.id).toBe("u-100");
            expect(result.commerce).toBeUndefined();
            expect(result.insights).toBeUndefined();
        });

        it("throws 403 Forbidden if non-self user lacks USER_360_VIEW permission", async () => {
            await expect(
                user360Service.getUser360("u-100", {
                    userId: "other-user",
                    permissions: [],
                }),
            ).rejects.toThrow("Forbidden");
        });
    });
});
