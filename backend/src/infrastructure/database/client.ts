import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

export type Database = ReturnType<typeof drizzle>;

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool);
}
