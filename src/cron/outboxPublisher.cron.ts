import cron, { type ScheduledTask } from "node-cron";
import { outboxPublisherService } from "@/modules/outbox/services/outboxPublisher.service.js";

let outboxTask: ScheduledTask | null = null;
let isPolling = false;

// Poll and publish pending outbox events
async function runOutboxPoll() {
    if (isPolling) return;

    try {
        isPolling = true;
        const result = await outboxPublisherService.pollAndPublishBatch(50);
        if (result.claimedCount > 0) {
            console.log(
                `[Cron: Outbox] Claimed: ${result.claimedCount}, Published: ${result.publishedCount}, Failed: ${result.failedCount}, DLQ: ${result.deadLetteredCount}`,
            );
        }
    } catch (err: any) {
        console.error("[Cron: Outbox Error]:", err.message);
    } finally {
        isPolling = false;
    }
}

// Start outbox publisher cron (default: runs every 5 seconds)
export function startOutboxPublisherCron(cronExpression = "*/5 * * * * *") {
    if (outboxTask) return;
    const expression = process.env.OUTBOX_CRON_EXPRESSION || cronExpression;
    outboxTask = cron.schedule(expression, runOutboxPoll);
    console.log(`✅ Outbox poller cron scheduled with "${expression}"`);
}

// Stop outbox publisher cron
export function stopOutboxPublisherCron() {
    if (outboxTask) {
        outboxTask.stop();
        outboxTask = null;
    }
}
