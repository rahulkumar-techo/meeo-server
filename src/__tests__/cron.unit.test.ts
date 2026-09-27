import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startCronJobs, stopCronJobs } from "@/cron/index.js";
import { startWorkers, stopWorkers } from "@/workers/index.js";
import { outboxPublisherService } from "@/modules/outbox/services/outboxPublisher.service.js";
import { orderFulfillmentService } from "@/modules/orders/services/orderFulfillment.service.js";
import { reservationService } from "@/modules/inventory/services/reservation.service.js";
import redis from "@/lib/redis.js";

vi.mock("@/modules/outbox/services/outboxPublisher.service.js", () => ({
    outboxPublisherService: {
        pollAndPublishBatch: vi.fn().mockResolvedValue({
            claimedCount: 2,
            publishedCount: 2,
            failedCount: 0,
            deadLetteredCount: 0,
        }),
    },
}));

vi.mock("@/modules/orders/services/orderFulfillment.service.js", () => ({
    orderFulfillmentService: {
        expireStaleOrders: vi.fn().mockResolvedValue({ expiredCount: 1 }),
    },
}));

vi.mock("@/modules/inventory/services/reservation.service.js", () => ({
    reservationService: {
        expireStaleReservations: vi.fn().mockResolvedValue({ expiredCount: 1 }),
    },
}));

vi.mock("@/lib/redis.js", () => ({
    default: {
        status: "ready",
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        quit: vi.fn().mockResolvedValue("OK"),
    },
}));

vi.mock("@/lib/queue.js", () => ({
    QUEUE_NAMES: {
        DOMAIN_EVENTS: "domain-events",
        DEAD_LETTER: "dead-letter-events",
    },
    createDomainEventWorker: vi.fn().mockReturnValue({
        close: vi.fn().mockResolvedValue(undefined),
    }),
    closeQueueConnections: vi.fn().mockResolvedValue(undefined),
}));

describe("Cron & Worker Lifecycle Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await stopCronJobs();
        await stopWorkers();
    });

    it("starts and stops all BullMQ workers cleanly", async () => {
        const { domainWorker, dlqWorker } = startWorkers();
        expect(domainWorker).toBeDefined();
        expect(dlqWorker).toBeDefined();

        await expect(stopWorkers()).resolves.not.toThrow();
    });

    it("starts and stops all Cron jobs cleanly", async () => {
        expect(() => startCronJobs()).not.toThrow();
        await expect(stopCronJobs()).resolves.not.toThrow();
    });
});
