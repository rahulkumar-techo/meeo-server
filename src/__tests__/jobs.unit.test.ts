import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorkerNodeService } from "@/modules/jobs/services/workerNode.service.js";
import { JobOverviewService } from "@/modules/jobs/services/jobOverview.service.js";
import { JobListService } from "@/modules/jobs/services/jobList.service.js";
import { JobOperationsService } from "@/modules/jobs/services/jobOperations.service.js";
import { prisma } from "@/lib/prisma.js";
import * as queueLib from "@/lib/queue.js";

// Mock dependencies
vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        outboxEvent: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
        },
        processedEvent: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock("@/lib/queue.js", () => ({
    domainEventQueue: {
        getWorkers: vi.fn().mockResolvedValue([]),
        getActiveCount: vi.fn().mockResolvedValue(0),
        getJobCounts: vi.fn().mockResolvedValue({
            waiting: 2,
            active: 1,
            completed: 100,
            failed: 2,
            delayed: 1,
        }),
        pause: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
    },
    deadLetterQueue: {
        getJobCounts: vi.fn().mockResolvedValue({
            waiting: 1,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
        }),
        obliterate: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
    },
    publishDomainEventJob: vi.fn().mockResolvedValue({ id: "job-123" }),
}));

describe("Background Jobs Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==========================================
    // 1. Worker Node Service Tests
    // ==========================================
    describe("WorkerNodeService", () => {
        const workerNodeService = new WorkerNodeService();

        it("collects live telemetry for worker node and pod instances", async () => {
            const nodes = await workerNodeService.getWorkerNodes();

            expect(nodes).toBeInstanceOf(Array);
            expect(nodes.length).toBeGreaterThan(0);

            const primary = nodes[0]!;
            expect(primary.nodeId).toBeDefined();
            expect(primary.podName).toMatch(/^worker-pod-/);
            expect(primary.hostname).toBeDefined();
            expect(["HEALTHY", "DEGRADED", "ONLINE"]).toContain(primary.status);
            expect(typeof primary.cpuUtilizationPercent).toBe("number");
            expect(primary.memoryUtilization.rssMb).toBeGreaterThan(0);
            expect(primary.memoryUtilization.heapUsedMb).toBeGreaterThan(0);
            expect(primary.concurrency.limit).toBe(10);
            expect(primary.uptimeSeconds).toBeGreaterThanOrEqual(0);
            expect(typeof primary.uptimeHuman).toBe("string");
            expect(primary.lastHeartbeat).toBeDefined();
        });
    });

    // ==========================================
    // 2. Job Overview Service Tests
    // ==========================================
    describe("JobOverviewService", () => {
        const jobOverviewService = new JobOverviewService();

        it("computes overall throughput, latencies, and DLQ depth", async () => {
            (prisma.outboxEvent.groupBy as any).mockResolvedValue([
                { status: "PENDING", _count: { _all: 3 } },
                { status: "PROCESSING", _count: { _all: 1 } },
                { status: "PUBLISHED", _count: { _all: 100 } },
                { status: "FAILED", _count: { _all: 2 } },
            ]);

            const overview = await jobOverviewService.getOverview();

            expect(overview.summary).toBeDefined();
            expect(overview.summary.activeJobsInFlight).toBeGreaterThanOrEqual(0);
            expect(overview.summary.throttledJobs).toBe(1);
            expect(overview.summary.jobsProcessedTotal).toBeGreaterThan(0);
            expect(overview.summary.successRatePercent).toBeGreaterThanOrEqual(0);
            expect(overview.summary.averageExecutionLatencyMs).toBe(42.5);
            expect(overview.summary.p95ExecutionLatencyMs).toBe(128.0);
            expect(overview.summary.deadLetterQueueDepth).toBe(1);
            expect(overview.summary.deadLetterTriggered).toBe(true);

            expect(overview.queues).toBeInstanceOf(Array);
            expect(overview.queues.length).toBe(4);

            const dlq = overview.queues.find((q) => q.name === "dead-letter-events");
            expect(dlq).toBeDefined();
            expect(dlq?.category).toBe("DEAD_LETTER_TRIGGER");
            expect(dlq?.status).toBe("CRITICAL");
        });
    });

    // ==========================================
    // 3. Job List Service Tests
    // ==========================================
    describe("JobListService", () => {
        const jobListService = new JobListService();

        it("lists and formats jobs for the interactive table view", async () => {
            const now = new Date();
            const mockEvents = [
                {
                    id: "event-1",
                    eventType: "ORDER_CREATED",
                    aggregateType: "Order",
                    aggregateId: "ord-1",
                    status: "PUBLISHED",
                    attempts: 1,
                    maxAttempts: 10,
                    lockedBy: "worker-pod-az1-1",
                    lastError: null,
                    nextRetryAt: null,
                    payload: { orderId: "ord-1", grandTotal: 100 },
                    createdAt: new Date(now.getTime() - 50),
                    publishedAt: now,
                },
                {
                    id: "event-2",
                    eventType: "NOTIFICATION_SEND",
                    aggregateType: "Notification",
                    aggregateId: "notif-1",
                    status: "FAILED",
                    attempts: 10,
                    maxAttempts: 10,
                    lockedBy: null,
                    lastError: "SMTP Timeout error",
                    nextRetryAt: null,
                    payload: { email: "test@example.com" },
                    createdAt: new Date(now.getTime() - 1000),
                    publishedAt: null,
                },
            ];

            (prisma.outboxEvent.findMany as any).mockResolvedValue(mockEvents);
            (prisma.outboxEvent.count as any).mockResolvedValue(2);

            const result = await jobListService.listJobs({ filter: "ALL", page: 1, limit: 20 });

            expect(result.items).toHaveLength(2);
            expect(result.pagination.total).toBe(2);

            // Item 1 verification
            const item1 = result.items[0]!;
            expect(item1.jobId).toBe("event-1");
            expect(item1.status).toBe("COMPLETED");
            expect(item1.handler).toBe("orderEventsConsumer");
            expect(item1.queue).toBe("domain-events");
            expect(item1.category).toBe("CRITICAL_CHECKOUTS");
            expect(item1.attempt).toBe("1/10");
            expect(item1.actions).toContain("INSPECT");

            // Item 2 (Dead letter) verification
            const item2 = result.items[1]!;
            expect(item2.jobId).toBe("event-2");
            expect(item2.status).toBe("DEAD_LETTER");
            expect(item2.handler).toBe("notificationConsumer");
            expect(item2.queue).toBe("dead-letter-events");
            expect(item2.category).toBe("DEAD_LETTER_TRIGGER");
            expect(item2.attempt).toBe("10/10");
            expect(item2.failedReason).toBe("SMTP Timeout error");
            expect(item2.actions).toContain("RETRY");
            expect(item2.actions).toContain("CANCEL");
        });

        it("filters correctly by queue category", async () => {
            (prisma.outboxEvent.findMany as any).mockResolvedValue([]);
            (prisma.outboxEvent.count as any).mockResolvedValue(0);

            await jobListService.listJobs({ filter: "ORDER_FULFILLMENT_SYNC", page: 1, limit: 10 });

            expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        eventType: { in: ["ORDER_SHIPPED", "ORDER_DELIVERED", "ORDER_CANCELLED"] },
                    }),
                }),
            );
        });
    });

    // ==========================================
    // 4. Job Operations Service Tests
    // ==========================================
    describe("JobOperationsService", () => {
        const jobOperationsService = new JobOperationsService();

        it("retrieves full job details including payload and consumer logs", async () => {
            (prisma.outboxEvent.findUnique as any).mockResolvedValue({
                id: "event-1",
                eventType: "ORDER_CONFIRMED",
                aggregateType: "Order",
                aggregateId: "ord-1",
                status: "PUBLISHED",
                payload: { orderNumber: "ORD-1001" },
                attempts: 1,
                maxAttempts: 10,
                lastError: null,
                createdAt: new Date(),
                publishedAt: new Date(),
            });

            (prisma.processedEvent.findMany as any).mockResolvedValue([
                {
                    id: "proc-1",
                    consumerName: "orderEventsConsumer",
                    status: "COMPLETED",
                    lastError: null,
                    processedAt: new Date(),
                },
            ]);

            const details = await jobOperationsService.getJobDetails("event-1");

            expect(details.jobId).toBe("event-1");
            expect(details.eventType).toBe("ORDER_CONFIRMED");
            expect(details.consumerLogs).toHaveLength(1);
            expect(details.consumerLogs[0]!.consumerName).toBe("orderEventsConsumer");
        });

        it("retries a failed job by resetting status to PENDING and re-enqueueing into BullMQ", async () => {
            (prisma.outboxEvent.findUnique as any).mockResolvedValue({
                id: "event-failed-1",
                eventType: "PAYMENT_SUCCEEDED",
                status: "FAILED",
                payload: { paymentId: "pay-1" },
                attempts: 3,
                maxAttempts: 10,
            });

            (prisma.outboxEvent.update as any).mockResolvedValue({
                id: "event-failed-1",
                status: "PENDING",
            });

            const result = await jobOperationsService.retryJob("event-failed-1");

            expect(result.jobId).toBe("event-failed-1");
            expect(result.status).toBe("WAITING");
            expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "event-failed-1" },
                    data: expect.objectContaining({ status: "PENDING", attempts: 0 }),
                }),
            );
            expect(queueLib.publishDomainEventJob).toHaveBeenCalledWith(
                "PAYMENT_SUCCEEDED",
                { paymentId: "pay-1" },
                "event-failed-1",
            );
        });

        it("prevents retrying an already completed/published job", async () => {
            (prisma.outboxEvent.findUnique as any).mockResolvedValue({
                id: "event-pub-1",
                status: "PUBLISHED",
            });

            await expect(jobOperationsService.retryJob("event-pub-1")).rejects.toThrow(
                "Job has already completed successfully and cannot be retried",
            );
        });

        it("cancels an active or waiting job", async () => {
            (prisma.outboxEvent.findUnique as any).mockResolvedValue({
                id: "event-waiting-1",
                status: "PENDING",
            });

            (prisma.outboxEvent.update as any).mockResolvedValue({
                id: "event-waiting-1",
                status: "FAILED",
            });

            const result = await jobOperationsService.cancelJob("event-waiting-1");

            expect(result.jobId).toBe("event-waiting-1");
            expect(result.status).toBe("CANCELLED");
            expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ lastError: "Job cancelled by operator" }),
                }),
            );
        });

        it("executes bulk action RETRY_ALL_FAILED successfully", async () => {
            (prisma.outboxEvent.findMany as any).mockResolvedValue([
                { id: "e1", eventType: "EV1", payload: {} },
                { id: "e2", eventType: "EV2", payload: {} },
            ]);
            (prisma.outboxEvent.updateMany as any).mockResolvedValue({ count: 2 });

            const result = await jobOperationsService.executeBulkAction({ action: "RETRY_ALL_FAILED" });

            expect(result.action).toBe("RETRY_ALL_FAILED");
            expect(result.affectedCount).toBe(2);
            expect(queueLib.publishDomainEventJob).toHaveBeenCalledTimes(2);
        });

        it("executes bulk action PURGE_DEAD_LETTER successfully", async () => {
            const result = await jobOperationsService.executeBulkAction({ action: "PURGE_DEAD_LETTER" });

            expect(result.action).toBe("PURGE_DEAD_LETTER");
            expect(queueLib.deadLetterQueue.obliterate).toHaveBeenCalled();
        });
    });
});
