import { startOutboxPublisherCron, stopOutboxPublisherCron } from "./outboxPublisher.cron.js";
import { startOrderSweeperCron, stopOrderSweeperCron } from "./orderSweeper.cron.js";
import { startWorkerHeartbeatCron, stopWorkerHeartbeatCron } from "./workerHeartbeat.cron.js";

export * from "./outboxPublisher.cron.js";
export * from "./orderSweeper.cron.js";
export * from "./workerHeartbeat.cron.js";

// Start all background cron jobs
export function startCronJobs() {
    startOutboxPublisherCron();
    startOrderSweeperCron();
    startWorkerHeartbeatCron();
    console.log("✅ All scheduled cron jobs started");
}

// Stop all background cron jobs
export async function stopCronJobs() {
    stopOutboxPublisherCron();
    stopOrderSweeperCron();
    await stopWorkerHeartbeatCron();
    console.log("🛑 All scheduled cron jobs stopped");
}
