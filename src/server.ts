import { buildApp } from "@/app.js";

const start = async (): Promise<void> => {
  const app = await buildApp();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      port,
      host,
    });
    app.log.info(`Server running on http://${host}:${port}`);

    const shutdown = async () => {
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