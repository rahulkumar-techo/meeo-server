import { createDomainEventWorker, QUEUE_NAMES } from "@/lib/queue.js";

// BullMQ Worker for processing Dead Letter Queue (DLQ) events for auditing and alerting
export function createDeadLetterWorker(concurrency = 2) {
    return createDomainEventWorker(
        QUEUE_NAMES.DEAD_LETTER,
        async (job) => {
            console.warn(`[DLQ Worker] ⚠️ Dead-lettered event received ${job.id} (${job.name}):`, job.data);
            return { deadLetterAcknowledged: true, id: job.id };
        },
        concurrency,
    );
}
