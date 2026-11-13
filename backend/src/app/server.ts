import { createApp } from "./create-app.js";
import { loadEnvironment } from "../infrastructure/config/env.js";

async function startServer(): Promise<void> {
  const environment = loadEnvironment();
  const app = await createApp(environment);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, "Shutting down server");
    await app.close();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT").catch((error: unknown) => {
      app.log.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    });
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM").catch((error: unknown) => {
      app.log.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    });
  });

  try {
    await app.listen({
      host: environment.HOST,
      port: environment.PORT,
    });
  } catch (error) {
    app.log.error({ err: error }, "Server failed to start");
    await app.close();
    process.exitCode = 1;
  }
}

void startServer();
