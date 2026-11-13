import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testEnvironmentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.env.test",
);

const loadedEnvironment = dotenv.config({
  path: testEnvironmentPath,
  override: true,
  quiet: true,
});

if (loadedEnvironment.error) {
  throw new Error(
    "Unable to load backend/.env.test. Copy backend/.env.test.example and configure it.",
  );
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("PostgreSQL integration tests require NODE_ENV=test.");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required in backend/.env.test.");
}

let parsedDatabaseUrl: URL;

try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL in backend/.env.test must be a valid URL.");
}

if (
  parsedDatabaseUrl.protocol !== "postgres:" &&
  parsedDatabaseUrl.protocol !== "postgresql:"
) {
  throw new Error(
    "DATABASE_URL in backend/.env.test must use a PostgreSQL URL scheme.",
  );
}

const databaseName = decodeURIComponent(
  parsedDatabaseUrl.pathname.replace(/^\/+/, ""),
);

if (databaseName !== "edutrack_test") {
  throw new Error(
    "PostgreSQL integration tests are restricted to the edutrack_test database.",
  );
}
