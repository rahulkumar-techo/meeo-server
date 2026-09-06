import { Queue, Worker, QueueEvents, type JobsOptions, type Processor } from "bullmq";
import redis from "./redis.js";

/**
 * Queue names for the application event infrastructure.
 */
export const QUEUE_NAMES = {
    DOMAIN_EVENTS: "domain-events",
    DEAD_LETTER: "dead-letter-events",
} as const;

/**
 * Standard default job options for domain events.
 */
export const DEFAULT_EVENT_JOB_OPTIONS: JobsOptions = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 2000,
    },
    removeOnComplete: {
        count: 1000,
        age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600, // 7 days
    },
};

/**
 * Redis connection configuration object extracted from Redis client or fallback URL.
 */
export const redisConnection = redis;

/**
 * Domain Events Primary Queue.
 */
export const domainEventQueue = new Queue(QUEUE_NAMES.DOMAIN_EVENTS, {
    connection: redisConnection,
    defaultJobOptions: DEFAULT_EVENT_JOB_OPTIONS,
});

/**
 * Dead Letter Queue (DLQ) for capturing unrecoverable / max-retried events.
 */
export const deadLetterQueue = new Queue(QUEUE_NAMES.DEAD_LETTER, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
    },
});

/**
 * Publishes a domain event payload to the primary domain-events queue with deduplication via jobId.
 */
export async function publishDomainEventJob(
    jobName: string,
    payload: Record<string, unknown>,
    jobId?: string,
    opts?: JobsOptions,
) {
    const finalJobId = jobId || (payload.id as string | undefined);
    const options: JobsOptions = {
        ...DEFAULT_EVENT_JOB_OPTIONS,
        ...opts,
    };
    if (finalJobId) {
        options.jobId = finalJobId;
    }

    return domainEventQueue.add(
        jobName,
        payload,
        options,
    );
}

/**
 * Publishes an event to the Dead Letter Queue for audit and manual troubleshooting.
 */
export async function publishDlqEventJob(
    jobName: string,
    payload: Record<string, unknown>,
    errorReason: string,
) {
    return deadLetterQueue.add(
        jobName,
        {
            ...payload,
            dlqReason: errorReason,
            deadLetteredAt: new Date().toISOString(),
        },
        {
            jobId: `dlq-${payload.id ?? Date.now()}`,
        },
    );
}

/**
 * Factory to create a BullMQ worker for a specific queue with graceful error handling.
 */
export function createDomainEventWorker<T = any, R = any>(
    queueName: string,
    processor: Processor<T, R>,
    concurrency = 5,
) {
    const worker = new Worker<T, R>(queueName, processor, {
        connection: redisConnection,
        concurrency,
    });

    worker.on("completed", (job) => {
        console.log(`[BullMQ Worker] Job ${job.id} (${job.name}) completed successfully.`);
    });

    worker.on("failed", (job, err) => {
        console.error(`[BullMQ Worker] Job ${job?.id} (${job?.name}) failed:`, err.message);
    });

    worker.on("error", (err) => {
        console.error(`[BullMQ Worker] Worker error on queue ${queueName}:`, err);
    });

    return worker;
}

/**
 * Retrieves queue operational health and job count metrics.
 */
export async function getQueueMetrics() {
    const [domainCounts, dlqCounts] = await Promise.all([
        domainEventQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
        deadLetterQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    ]);

    return {
        domainEvents: domainCounts,
        deadLetter: dlqCounts,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Gracefully closes BullMQ queue connections during shutdown.
 */
export async function closeQueueConnections() {
    await Promise.allSettled([
        domainEventQueue.close(),
        deadLetterQueue.close(),
    ]);
}
