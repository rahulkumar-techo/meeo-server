import cron, { type ScheduledTask } from "node-cron";
import { userBehaviourAggregationService } from "@/modules/tracking/services/userBehaviourAggregation.service.js";

let aggregationTask: ScheduledTask | null = null;
let retentionTask: ScheduledTask | null = null;
let isAggregating = false;
let isPurging = false;

// Poll and aggregate raw user events
async function runAggregationBatch() {
    if (isAggregating) return;

    try {
        isAggregating = true;
        const result = await userBehaviourAggregationService.processBatch(100);
        if (result.processedCount > 0) {
            console.log(
                `[Cron: User Behaviour] Processed ${result.processedCount} event(s) across ${result.affectedUsers} user(s)`,
            );
        }
    } catch (err: any) {
        console.error("[Cron: User Behaviour Aggregation Error]:", err?.message || err);
    } finally {
        isAggregating = false;
    }
}

// Nightly retention job to purge raw events older than retention period (default: 60 days)
async function runRetentionPurge() {
    if (isPurging) return;

    try {
        isPurging = true;
        const retentionDays = Number(process.env.TRACKING_RETENTION_DAYS) || 60;
        const purgedCount = await userBehaviourAggregationService.purgeOldEvents(retentionDays);
        if (purgedCount > 0) {
            console.log(`[Cron: Tracking Retention] Purged ${purgedCount} expired raw event(s) (> ${retentionDays} days)`);
        }
    } catch (err: any) {
        console.error("[Cron: Tracking Retention Error]:", err.message);
    } finally {
        isPurging = false;
    }
}

// Start user behaviour aggregation cron.
// Staggered interval (every 20s at seconds 07, 27, 47) prevents overlapping database IO spikes 
// with Outbox poller (runs on :00, :05, :10...) and Heartbeat (runs on :03, :18, :33...), 
// eliminating "[NODE-CRON] [WARN] missed execution" warnings on constrained CPU hosts like Render.
export function startUserBehaviourCron(cronExpression = "7,27,47 * * * * *") {
    if (aggregationTask) return;
    const expression = process.env.USER_BEHAVIOUR_CRON_EXPRESSION || cronExpression;
    aggregationTask = cron.schedule(expression, runAggregationBatch);
    console.log(`✅ User behaviour aggregation cron scheduled with "${expression}"`);

    // Run nightly at 02:00 AM for data retention
    if (!retentionTask) {
        retentionTask = cron.schedule("0 2 * * *", runRetentionPurge);
        console.log("✅ Tracking data retention cron scheduled (Daily at 02:00 AM)");
    }
}

// Stop user behaviour aggregation cron
export function stopUserBehaviourCron() {
    if (aggregationTask) {
        aggregationTask.stop();
        aggregationTask = null;
    }
    if (retentionTask) {
        retentionTask.stop();
        retentionTask = null;
    }
}
