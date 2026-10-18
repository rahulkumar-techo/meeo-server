import { createDomainEventWorker, QUEUE_NAMES } from "@/lib/queue.js";
import { eventRouter } from "./consumers/eventRouter.js";
import { logger } from "@/common/observability/logger.js";

// BullMQ Worker for processing primary domain events (Orders, Payments, Notifications)
export function createDomainWorker(concurrency = 5) {
    return createDomainEventWorker(
        QUEUE_NAMES.DOMAIN_EVENTS,
        async (job) => {
            logger.info({ jobId: job.id, jobName: job.name }, "[Domain Worker] Processing event");
            return eventRouter.routeEvent(job);
        },
        concurrency,
    );
}
