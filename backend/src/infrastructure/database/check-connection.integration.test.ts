import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";

import { checkDatabaseConnection } from "./check-connection.js";
import { createDatabasePool } from "./pool.js";

const databaseUrl = process.env.DATABASE_URL;

const pool = databaseUrl
  ? createDatabasePool({
      DATABASE_URL: databaseUrl,
    })
  : undefined;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!pool)("PostgreSQL connectivity", () => {
  it("runs a simple query against the configured database", async () => {
    await expect(checkDatabaseConnection(pool!)).resolves.toEqual({
      status: "ok",
    });
  });
});
