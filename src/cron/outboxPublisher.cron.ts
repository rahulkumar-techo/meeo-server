import cron, { type ScheduledTask } from "node-cron";
import { outboxPublisherService } from "@/modules/outbox/services/outboxPublisher.service.js";
import { logger } from "@/common/observability/logger.js";

let outboxTask: ScheduledTask | null = null;
let isPolling = false;

// Poll and publish pending outbox events
async function runOutboxPoll() {
    if (isPolling) return;

    try {
        isPolling = true;
        const result = await outboxPublisherService.pollAndPublishBatch(50);
        if (result.claimedCount > 0) {
            logger.info(
                {
                    claimedCount: result.claimedCount,
                    publishedCount: result.publishedCount,
                    failedCount: result.failedCount,
                    deadLetteredCount: result.deadLetteredCount,
                },
                "[Cron: Outbox] Processed outbox batch",
            );
        }
    } catch (err: any) {
        logger.error({ error: err.message }, "[Cron: Outbox Error]");
    } finally {
        isPolling = false;
    }
}

// Start outbox publisher cron (default: runs every 5 seconds at :00, :05, :10...)
// Polling frequency can be tuned via OUTBOX_CRON_EXPRESSION env variable.
export function startOutboxPublisherCron(cronExpression = "*/5 * * * * *") {
    if (outboxTask) return;
    const expression = process.env.OUTBOX_CRON_EXPRESSION || cronExpression;
    outboxTask = cron.schedule(expression, runOutboxPoll);
    logger.info(`Outbox poller cron scheduled with "${expression}"`);
}

// Stop outbox publisher cron
export function stopOutboxPublisherCron() {
    if (outboxTask) {
        outboxTask.stop();
        outboxTask = null;
    }
}
