import { loadEnvironment } from "../config/env.js";
import { createDatabasePool } from "./pool.js";

async function showMigrationStatus(): Promise<void> {
  const environment = loadEnvironment();
  const pool = createDatabasePool(environment);

  try {
    const result = await pool.query<{
      hash: string;
      created_at: string;
    }>(
      `SELECT hash, created_at
       FROM drizzle.__drizzle_migrations
       ORDER BY created_at`,
    );

    if (result.rowCount === 0) {
      console.log("No applied migrations.");
      return;
    }

    console.log("Applied migrations:");
    for (const migration of result.rows) {
      console.log(`${migration.created_at} ${migration.hash}`);
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42P01"
    ) {
      console.log(
        "Migration history table does not exist; no migrations are recorded.",
      );
      return;
    }

    throw error;
  } finally {
    await pool.end();
  }
}

void showMigrationStatus();
