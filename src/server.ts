import { buildApp } from "@/app.js";
import { initSocketServer, closeSocketServer } from "@/sockets/socket.server.js";
import { startWorkers, stopWorkers } from "@/workers/index.js";
import { startCronJobs, stopCronJobs } from "@/cron/index.js";
import { closeQueueConnections } from "@/lib/queue.js";

const start = async (): Promise<void> => {
  const app = await buildApp();

  const port = Number(process.env.PORT ?? 5000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      port,
      host,
    });

    // 1. Initialize WebSockets
    initSocketServer(app.server);
    app.log.info("WebSocket server initialized on path /socket.io");

    // 2. Start BullMQ Background Workers
    startWorkers();

    // 3. Start Scheduled Cron Jobs (Sweepers & Heartbeats)
    startCronJobs();

    app.log.info(`Server running on http://${host}:${port}`);

    // Graceful shutdown handler
    const shutdown = async () => {
      app.log.info("Shutting down server gracefully...");
      await stopCronJobs();
      await stopWorkers();
      await closeSocketServer();
      await closeQueueConnections();
      await app.close();
      process.exit(0);
    };

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();