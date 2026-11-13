import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { createDatabase } from "../../src/infrastructure/database/client.js";
import { createDatabasePool } from "../../src/infrastructure/database/pool.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL was not loaded by the integration setup.");
}

const pool = createDatabasePool({ DATABASE_URL: databaseUrl });
const database = createDatabase(pool);

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL integration", () => {
  it("runs a read-only SELECT 1 through Drizzle", async () => {
    const result = await database.execute(sql`SELECT 1 AS value`);

    expect(result.rows).toEqual([{ value: 1 }]);
  });
});
