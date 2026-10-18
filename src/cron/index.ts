import { logger } from "@/common/observability/logger.js";
import { startOutboxPublisherCron, stopOutboxPublisherCron } from "./outboxPublisher.cron.js";
import { startOrderSweeperCron, stopOrderSweeperCron } from "./orderSweeper.cron.js";
import { startWorkerHeartbeatCron, stopWorkerHeartbeatCron } from "./workerHeartbeat.cron.js";
import { startUserBehaviourCron, stopUserBehaviourCron } from "./userBehaviourWorker.cron.js";

export * from "./outboxPublisher.cron.js";
export * from "./orderSweeper.cron.js";
export * from "./workerHeartbeat.cron.js";
export * from "./userBehaviourWorker.cron.js";

// Start all background cron jobs
export function startCronJobs() {
    // In clustered multi-process environments (PM2 cluster mode), only the primary worker
    // (instance 0) executes scheduled cron sweepers to avoid duplicate DB operations.
    const isPrimaryWorker = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === "0";
    if (!isPrimaryWorker) {
        logger.info(`[Cron] Secondary cluster worker (Instance ${process.env.NODE_APP_INSTANCE}) skipping scheduled sweepers.`);
        startWorkerHeartbeatCron();
        return;
    }

    startOutboxPublisherCron();
    startOrderSweeperCron();
    startWorkerHeartbeatCron();
    startUserBehaviourCron();
    logger.info("All scheduled cron jobs started on primary worker instance");
}

// Stop all background cron jobs
export async function stopCronJobs() {
    stopOutboxPublisherCron();
    stopOrderSweeperCron();
    await stopWorkerHeartbeatCron();
    stopUserBehaviourCron();
    logger.info("All scheduled cron jobs stopped");
}

