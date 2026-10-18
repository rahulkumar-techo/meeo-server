import type { Worker } from "bullmq";
import { logger } from "@/common/observability/logger.js";
import { createDomainWorker } from "./domainEvent.worker.js";
import { createDeadLetterWorker } from "./deadLetter.worker.js";

export * from "./domainEvent.worker.js";
export * from "./deadLetter.worker.js";

let domainWorkerInstance: Worker | null = null;
let dlqWorkerInstance: Worker | null = null;

// Start all BullMQ workers
export function startWorkers() {
    if (!domainWorkerInstance) {
        domainWorkerInstance = createDomainWorker(5);
    }
    if (!dlqWorkerInstance) {
        dlqWorkerInstance = createDeadLetterWorker(2);
    }
    logger.info("BullMQ workers started (domain-events & dead-letter-events)");
    return {
        domainWorker: domainWorkerInstance,
        dlqWorker: dlqWorkerInstance,
    };
}

// Stop all BullMQ workers gracefully
export async function stopWorkers() {
    const promises: Promise<void>[] = [];

    if (domainWorkerInstance) {
        promises.push(domainWorkerInstance.close());
        domainWorkerInstance = null;
    }
    if (dlqWorkerInstance) {
        promises.push(dlqWorkerInstance.close());
        dlqWorkerInstance = null;
    }

    await Promise.allSettled(promises);
    logger.info("BullMQ workers stopped");
}
