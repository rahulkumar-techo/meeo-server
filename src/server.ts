import { buildApp } from "@/app.js";
import { startKeepAliveCron } from "@/cron/keep-alive.cron.js";

const start = async (): Promise<void> => {
  const app = await buildApp();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      port,
      host,
    });
    const keepAliveTask = startKeepAliveCron(port);
    app.log.info(`Server running on http://${host}:${port}`);

    const shutdown = async () => {
      keepAliveTask.stop();
      await app.close();
    };

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  } catch (error) {
    app.log.error(error);

    process.exit(1);
  }
};

void start();