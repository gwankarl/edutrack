import Fastify from "fastify";

import { createDatabase } from "../infrastructure/database/client.js";
import { createDatabasePool } from "../infrastructure/database/pool.js";
import type { Environment } from "../infrastructure/config/env.js";
import { createLoggerOptions } from "../infrastructure/logging/logger-options.js";
import { registerErrorHandler } from "../shared/errors/error-handler.js";
import { registerModules } from "./register-modules.js";

export async function createApp(environment: Environment) {
  const app = Fastify({
    logger: createLoggerOptions(environment),
  });

  const pool = createDatabasePool(environment);
  app.decorate("db", createDatabase(pool));

  app.addHook("onClose", async () => {
    await pool.end();
  });

  registerErrorHandler(app);
  await registerModules(app);

  return app;
}
