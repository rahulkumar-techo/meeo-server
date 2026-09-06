import { describe, it, expect, vi, beforeEach } from "vitest";
import { OutboxRetryService } from "@/modules/outbox/services/outboxRetry.service.js";
import { OutboxPublisherService } from "@/modules/outbox/services/outboxPublisher.service.js";
import { ProcessedEventService } from "@/modules/outbox/services/processedEvent.service.js";
import { EventRouter } from "@/modules/outbox/handlers/eventRouter.js";
import { orderEventsConsumer } from "@/modules/outbox/handlers/consumers/orderEventsConsumer.js";
import { paymentEventsConsumer } from "@/modules/outbox/handlers/consumers/paymentEventsConsumer.js";
import { prisma } from "@/lib/prisma.js";
import * as queueLib from "@/lib/queue.js";

// Mock dependencies
vi.mock("@/lib/prisma.js", () => ({
    prisma: {
        outboxEvent: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            count: vi.fn(),
        },
        processedEvent: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

vi.mock("@/lib/queue.js", () => ({
    publishDomainEventJob: vi.fn(),
    publishDlqEventJob: vi.fn(),
    getQueueMetrics: vi.fn().mockResolvedValue({ domainEvents: {}, deadLetter: {} }),
    createDomainEventWorker: vi.fn(),
    QUEUE_NAMES: {
        DOMAIN_EVENTS: "domain-events",
        DEAD_LETTER: "dead-letter-events",
    },
}));

describe("Transactional Outbox Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("OutboxRetryService", () => {
        const retryService = new OutboxRetryService();

        it("calculates exponential backoff with growing delays", () => {
            const delay1 = retryService.computeExponentialBackoff(1, { jitterRatio: 0, baseDelayMs: 1000 });
            const delay2 = retryService.computeExponentialBackoff(2, { jitterRatio: 0, baseDelayMs: 1000 });
            const delay3 = retryService.computeExponentialBackoff(3, { jitterRatio: 0, baseDelayMs: 1000 });

            expect(delay1).toBe(1000); // 1000 * 2^0
            expect(delay2).toBe(2000); // 1000 * 2^1
            expect(delay3).toBe(4000); // 1000 * 2^2
        });

        it("caps maximum delay at maxDelayMs", () => {
            const delayHigh = retryService.computeExponentialBackoff(20, {
                jitterRatio: 0,
                baseDelayMs: 1000,
                maxDelayMs: 60000,
            });

            expect(delayHigh).toBe(60000);
        });

        it("calculates future nextRetryDate", () => {
            const nextDate = retryService.calculateNextRetryDate(2, { baseDelayMs: 5000 });
            expect(nextDate.getTime()).toBeGreaterThan(Date.now());
        });

        it("unlocks stale processing events", async () => {
            vi.mocked(prisma.outboxEvent.updateMany).mockResolvedValue({ count: 3 } as any);

            const count = await retryService.unlockStaleEvents(300000);
            expect(count).toBe(3);
            expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ status: "PROCESSING" }),
                    data: expect.objectContaining({ status: "PENDING", lockedBy: null }),
                }),
            );
        });
    });

    describe("OutboxPublisherService", () => {
        const publisherService = new OutboxPublisherService();

        it("creates outbox event transactionally", async () => {
            const mockTx = {
                outboxEvent: {
                    create: vi.fn().mockResolvedValue({ id: "evt-123", status: "PENDING" }),
                },
            };

            const result = await publisherService.createOutboxEvent(mockTx as any, {
                eventType: "ORDER_CONFIRMED",
                aggregateType: "Order",
                aggregateId: "order-1",
                payload: { orderNumber: "ORD-1001" },
            });

            expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    eventType: "ORDER_CONFIRMED",
                    aggregateType: "Order",
                    aggregateId: "order-1",
                    status: "PENDING",
                }),
            });
            expect(result.id).toBe("evt-123");
        });

        it("claims batch and locks events with publisher ID", async () => {
            vi.mocked(prisma.outboxEvent.updateMany).mockResolvedValue({ count: 2 } as any);
            vi.mocked(prisma.outboxEvent.findMany)
                .mockResolvedValueOnce([{ id: "evt-1" }, { id: "evt-2" }] as any) // candidates
                .mockResolvedValueOnce([{ id: "evt-1" }, { id: "evt-2" }] as any); // locked confirmation

            const lockedIds = await publisherService.claimBatchForPublishing(10);

            expect(lockedIds).toEqual(["evt-1", "evt-2"]);
            expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
                where: {
                    id: { in: ["evt-1", "evt-2"] },
                    status: "PENDING",
                },
                data: expect.objectContaining({
                    status: "PROCESSING",
                    lockedBy: publisherService.getPublisherId(),
                }),
            });
        });

        it("publishes claimed batch to BullMQ and marks PUBLISHED", async () => {
            vi.mocked(prisma.outboxEvent.updateMany).mockResolvedValue({ count: 1 } as any);
            vi.mocked(prisma.outboxEvent.findMany)
                .mockResolvedValueOnce([{ id: "evt-1" }] as any) // candidate IDs
                .mockResolvedValueOnce([{ id: "evt-1" }] as any) // locked IDs
                .mockResolvedValueOnce([
                    {
                        id: "evt-1",
                        eventType: "ORDER_CONFIRMED",
                        aggregateType: "Order",
                        aggregateId: "ord-1",
                        payload: { total: 100 },
                        attempts: 0,
                        maxAttempts: 5,
                        createdAt: new Date(),
                    },
                ] as any); // full events

            vi.mocked(queueLib.publishDomainEventJob).mockResolvedValue({ id: "job-1" } as any);
            vi.mocked(prisma.outboxEvent.update).mockResolvedValue({ id: "evt-1", status: "PUBLISHED" } as any);

            const result = await publisherService.pollAndPublishBatch(10);

            expect(result.claimedCount).toBe(1);
            expect(result.publishedCount).toBe(1);
            expect(queueLib.publishDomainEventJob).toHaveBeenCalledWith(
                "ORDER_CONFIRMED",
                expect.objectContaining({ id: "evt-1", eventType: "ORDER_CONFIRMED" }),
                "evt-1",
            );
            expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "evt-1" },
                    data: expect.objectContaining({ status: "PUBLISHED", lockedBy: null }),
                }),
            );
        });

        it("transitions to FAILED and forwards to DLQ when maxAttempts is reached", async () => {
            vi.mocked(prisma.outboxEvent.updateMany).mockResolvedValue({ count: 1 } as any);
            vi.mocked(prisma.outboxEvent.findMany)
                .mockResolvedValueOnce([{ id: "evt-failed" }] as any)
                .mockResolvedValueOnce([{ id: "evt-failed" }] as any)
                .mockResolvedValueOnce([
                    {
                        id: "evt-failed",
                        eventType: "PAYMENT_FAILED",
                        aggregateType: "Payment",
                        aggregateId: "pay-1",
                        payload: {},
                        attempts: 2, // 2 + 1 = 3 == maxAttempts
                        maxAttempts: 3,
                        createdAt: new Date(),
                    },
                ] as any);

            vi.mocked(queueLib.publishDomainEventJob).mockRejectedValue(new Error("Redis connection refused"));
            vi.mocked(queueLib.publishDlqEventJob).mockResolvedValue({ id: "dlq-1" } as any);

            const result = await publisherService.pollAndPublishBatch(10);

            expect(result.deadLetteredCount).toBe(1);
            expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "evt-failed" },
                    data: expect.objectContaining({ status: "FAILED", attempts: 3 }),
                }),
            );
            expect(queueLib.publishDlqEventJob).toHaveBeenCalledWith(
                "dlq-PAYMENT_FAILED",
                expect.objectContaining({ id: "evt-failed" }),
                "Redis connection refused",
            );
        });

        it("manually resets failed event for retry", async () => {
            vi.mocked(prisma.outboxEvent.findUnique).mockResolvedValue({
                id: "evt-f1",
                status: "FAILED",
            } as any);
            vi.mocked(prisma.outboxEvent.update).mockResolvedValue({
                id: "evt-f1",
                status: "PENDING",
                attempts: 0,
            } as any);

            const res = await publisherService.retryFailedEvent("evt-f1");
            expect(res.status).toBe("PENDING");
            expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
                where: { id: "evt-f1" },
                data: expect.objectContaining({
                    status: "PENDING",
                    attempts: 0,
                    nextRetryAt: null,
                    lastError: null,
                }),
            });
        });
    });

    describe("ProcessedEventService (Consumer Idempotency)", () => {
        const processedService = new ProcessedEventService();

        it("executes handler and marks COMPLETED for new event", async () => {
            vi.mocked(prisma.processedEvent.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.processedEvent.upsert).mockResolvedValue({
                id: "proc-1",
                eventId: "evt-10",
                consumerName: "OrderConsumer",
                status: "PROCESSING",
            } as any);
            vi.mocked(prisma.processedEvent.update).mockResolvedValue({
                id: "proc-1",
                status: "COMPLETED",
            } as any);

            const handlerSpy = vi.fn().mockResolvedValue({ orderProcessed: true });

            const result = await processedService.runWithConsumerIdempotency(
                "OrderConsumer",
                "evt-10",
                handlerSpy,
            );

            expect(handlerSpy).toHaveBeenCalledTimes(1);
            expect(result.success).toBe(true);
            expect(result.alreadyProcessed).toBe(false);
            expect(result.data).toEqual({ orderProcessed: true });
            expect(prisma.processedEvent.update).toHaveBeenCalledWith({
                where: { id: "proc-1" },
                data: expect.objectContaining({ status: "COMPLETED" }),
            });
        });

        it("skips execution cleanly if event was already COMPLETED by this consumer", async () => {
            vi.mocked(prisma.processedEvent.findUnique).mockResolvedValue({
                id: "proc-already-done",
                eventId: "evt-10",
                consumerName: "OrderConsumer",
                status: "COMPLETED",
            } as any);

            const handlerSpy = vi.fn();

            const result = await processedService.runWithConsumerIdempotency(
                "OrderConsumer",
                "evt-10",
                handlerSpy,
            );

            expect(handlerSpy).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.alreadyProcessed).toBe(true);
        });

        it("marks status as FAILED and rethrows when handler fails", async () => {
            vi.mocked(prisma.processedEvent.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.processedEvent.upsert).mockResolvedValue({
                id: "proc-fail",
                status: "PROCESSING",
            } as any);
            vi.mocked(prisma.processedEvent.update).mockResolvedValue({
                id: "proc-fail",
                status: "FAILED",
            } as any);

            const handlerSpy = vi.fn().mockRejectedValue(new Error("Third party service timeout"));

            await expect(
                processedService.runWithConsumerIdempotency("OrderConsumer", "evt-err", handlerSpy),
            ).rejects.toThrow("Third party service timeout");

            expect(prisma.processedEvent.update).toHaveBeenCalledWith({
                where: { id: "proc-fail" },
                data: expect.objectContaining({
                    status: "FAILED",
                    lastError: "Third party service timeout",
                }),
            });
        });
    });

    describe("EventRouter & Consumers", () => {
        const router = new EventRouter();

        it("routes ORDER_* events to OrderEventsConsumer", async () => {
            const handleOrderSpy = vi.spyOn(orderEventsConsumer, "handleEvent").mockResolvedValue({ success: true } as any);

            const mockJob = {
                id: "job-101",
                name: "ORDER_CONFIRMED",
                data: {
                    id: "evt-order",
                    eventType: "ORDER_CONFIRMED",
                    aggregateType: "Order",
                    aggregateId: "ord-99",
                    payload: { orderNumber: "ORD-99" },
                },
            };

            const result = await router.routeEvent(mockJob as any);

            expect(handleOrderSpy).toHaveBeenCalledWith(mockJob.data);
            expect(result.routed).toBe(true);
        });

        it("routes PAYMENT_* events to PaymentEventsConsumer", async () => {
            const handlePaymentSpy = vi.spyOn(paymentEventsConsumer, "handleEvent").mockResolvedValue({ success: true } as any);

            const mockJob = {
                id: "job-102",
                name: "PAYMENT_SUCCESS",
                data: {
                    id: "evt-payment",
                    eventType: "PAYMENT_SUCCESS",
                    aggregateType: "Payment",
                    aggregateId: "pay-50",
                    payload: { amount: 1500, currency: "USD" },
                },
            };

            const result = await router.routeEvent(mockJob as any);

            expect(handlePaymentSpy).toHaveBeenCalledWith(mockJob.data);
            expect(result.routed).toBe(true);
        });
    });
});
