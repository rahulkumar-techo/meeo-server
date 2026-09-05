import cron, { type ScheduledTask } from "node-cron";

const KEEP_ALIVE_SCHEDULE = "*/12 * * * *";

/** Starts the keep-alive request that prevents an idle hosted instance from sleeping. */
export function startKeepAliveCron(port: number): ScheduledTask {
    const targetUrl = process.env.KEEP_ALIVE_URL ?? `http://127.0.0.1:${port}/ping`;

    const task = cron.schedule(KEEP_ALIVE_SCHEDULE, async () => {
        try {
            const response = await fetch(targetUrl);
            if (!response.ok) {
                console.error(`[keep-alive] ping failed with status ${response.status}`);
                return;
            }

            console.info(`[keep-alive] ping successful: ${targetUrl}`);
        } catch (error) {
            console.error("[keep-alive] ping request failed", error);
        }
    });

    console.info(`[keep-alive] scheduled every 12 minutes: ${targetUrl}`);
    return task;
}
