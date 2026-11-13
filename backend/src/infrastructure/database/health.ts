import type { Pool } from "pg";

export type DatabaseHealthResult = { status: "ok" } | { status: "unavailable" };

export async function checkDatabaseHealth(
  pool: Pool,
): Promise<DatabaseHealthResult> {
  try {
    await pool.query("SELECT 1");
    return { status: "ok" };
  } catch {
    return { status: "unavailable" };
  }
}
