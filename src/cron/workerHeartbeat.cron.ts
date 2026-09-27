import cron, { type ScheduledTask } from "node-cron";
import redis from "@/lib/redis.js";
import { QUEUE_NAMES } from "@/lib/queue.js";

const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;
let heartbeatTask: ScheduledTask | null = null;

// Send worker telemetry heartbeat to Redis
async function sendHeartbeat() {
    try {
        if (redis.status === "ready" || redis.status === "connect") {
            const heartbeatData = {
                workerId: WORKER_ID,
                workerName: "event-worker",
                status: "running",
                pid: process.pid,
                queues: [QUEUE_NAMES.DOMAIN_EVENTS, QUEUE_NAMES.DEAD_LETTER],
                concurrency: 5,
                lastHeartbeatAt: new Date().toISOString(),
                uptimeSeconds: Number(process.uptime().toFixed(1)),
            };
            await redis.set(`worker:heartbeat:${WORKER_ID}`, JSON.stringify(heartbeatData), "EX", 30);
        }
    } catch {
        // Silently ignore transient Redis heartbeat failures
    }
}

// Start worker heartbeat cron (default: runs every 10 seconds)
export function startWorkerHeartbeatCron(cronExpression = "*/10 * * * * *") {
    if (heartbeatTask) return;
    const expression = process.env.HEARTBEAT_CRON_EXPRESSION || cronExpression;
    heartbeatTask = cron.schedule(expression, sendHeartbeat);
    sendHeartbeat().catch(() => {});
    console.log(`✅ Worker heartbeat cron scheduled with "${expression}"`);
}

// Stop worker heartbeat cron and cleanup Redis key
export async function stopWorkerHeartbeatCron() {
    if (heartbeatTask) {
        heartbeatTask.stop();
        heartbeatTask = null;
    }
    try {
        if (redis.status === "ready" || redis.status === "connect") {
            await redis.del(`worker:heartbeat:${WORKER_ID}`);
        }
    } catch {
        // Ignore errors during shutdown
    }
}
``