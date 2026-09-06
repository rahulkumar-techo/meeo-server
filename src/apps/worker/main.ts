import "dotenv/config";
import { createDomainEventWorker, QUEUE_NAMES, closeQueueConnections } from "@/lib/queue.js";
import { eventRouter } from "@/modules/outbox/handlers/eventRouter.js";
import { outboxPublisherService } from "@/modules/outbox/services/outboxPublisher.service.js";
import redis from "@/lib/redis.js";

console.log("==================================================");
console.log("🚀 Starting E-Commerce Event Worker Server");
console.log("==================================================");

// 1. Worker for Primary Domain Events
const domainWorker = createDomainEventWorker(
    QUEUE_NAMES.DOMAIN_EVENTS,
    async (job) => {
        console.log(`[Worker] Processing Domain Event Job ${job.id} (${job.name})`);
        return eventRouter.routeEvent(job);
    },
    5, // Concurrency: 5 simultaneous event handlers
);

// 2. Worker for Dead Letter Queue (DLQ)
const dlqWorker = createDomainEventWorker(
    QUEUE_NAMES.DEAD_LETTER,
    async (job) => {
        console.warn(`[DLQ Worker] Received Dead-Lettered Event ${job.id} (${job.name}):`, job.data);
        // DLQ auditing / alerting logic (e.g. notify Sentry, Slack alert, or ops dashboard)
        return { deadLetterAcknowledged: true, id: job.id };
    },
    2,
);

// 3. Worker Heartbeat Reporting for Observability
const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;
const HEARTBEAT_INTERVAL_MS = 10000;

const sendHeartbeat = async () => {
    if (isShuttingDown) return;
    try {
        if (redis.status === "ready" || redis.status === "connect") {
            const heartbeatData = {
                workerId: WORKER_ID,
                workerName: "event-worker",
                status: "running",
                pid: process.pid,
                queues: [QUEUE_NAMES.DOMAIN_EVENTS, QUEUE_NAMES.DEAD_LETTER],
                concurrency: 5,
                lastHeartbeatAt: new Date().toISOString(),
                uptimeSeconds: Number(process.uptime().toFixed(1)),
            };
            await redis.set(`worker:heartbeat:${WORKER_ID}`, JSON.stringify(heartbeatData), "EX", 30);
        }
    } catch (err: any) {
        // Silently log or ignore transient Redis heartbeat failures
    }
};

const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
sendHeartbeat().catch(() => {});

// 4. Outbox Publisher Poller Loop (Relay)
const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS) || 5000;
let isPolling = false;
let isShuttingDown = false;

const pollInterval = setInterval(async () => {
    if (isPolling || isShuttingDown) return;

    try {
        isPolling = true;
        const result = await outboxPublisherService.pollAndPublishBatch(50);
        if (result.claimedCount > 0) {
            console.log(
                `[Outbox Poller] Claimed: ${result.claimedCount}, Published: ${result.publishedCount}, Failed: ${result.failedCount}, DLQ: ${result.deadLetteredCount}`,
            );
        }
    } catch (err: any) {
        console.error("[Outbox Poller Error]:", err.message);
    } finally {
        isPolling = false;
    }
}, POLL_INTERVAL_MS);

console.log(`✅ Workers active on "${QUEUE_NAMES.DOMAIN_EVENTS}" & "${QUEUE_NAMES.DEAD_LETTER}"`);
console.log(`✅ Outbox poller loop running every ${POLL_INTERVAL_MS}ms`);

// 5. Graceful Shutdown
async function gracefulShutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 Received ${signal}. Shutting down worker gracefully...`);
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);

    try {
        if (redis.status === "ready" || redis.status === "connect") {
            await redis.del(`worker:heartbeat:${WORKER_ID}`);
        }
        await Promise.allSettled([
            domainWorker.close(),
            dlqWorker.close(),
            closeQueueConnections(),
            redis.quit(),
        ]);
        console.log("👋 All workers and Redis connections closed cleanly. Exiting.");
        process.exit(0);
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
