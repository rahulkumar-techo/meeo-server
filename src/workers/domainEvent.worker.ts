import { createDomainEventWorker, QUEUE_NAMES } from "@/lib/queue.js";
import { eventRouter } from "./consumers/eventRouter.js";

// BullMQ Worker for processing primary domain events (Orders, Payments, Notifications)
export function createDomainWorker(concurrency = 5) {
    return createDomainEventWorker(
        QUEUE_NAMES.DOMAIN_EVENTS,
        async (job) => {
            console.log(`[Domain Worker] 📥 Processing event ${job.id} (${job.name})`);
            return eventRouter.routeEvent(job);
        },
        concurrency,
    );
}
