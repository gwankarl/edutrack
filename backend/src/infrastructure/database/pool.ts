import { Pool } from "pg";

import type { Environment } from "../config/env.js";

export function createDatabasePool(
  environment: Pick<Environment, "DATABASE_URL">,
): Pool {
  return new Pool({
    connectionString: environment.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
