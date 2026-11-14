import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../src/infrastructure/config/env.js";
import { createDatabasePool } from "../../src/infrastructure/database/pool.js";

const pool = createDatabasePool(loadEnvironment());

async function createUser(): Promise<string> {
  const email = `identity-${randomUUID()}@example.test`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [email, "synthetic-test-password-hash", "Integration Test User"],
  );

  return result.rows[0].id;
}

async function expectSqlState(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  let caught: unknown;

  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeDefined();

  if (typeof caught !== "object" || caught === null || !("code" in caught)) {
    throw new Error("Expected a PostgreSQL error with a SQLSTATE code.");
  }

  expect(caught.code).toBe(expectedCode);
}

describe("identity database schema", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error("Identity schema tests may only write to edutrack_test.");
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("enforces email uniqueness without regard to letter case", async () => {
    const email = `case-${randomUUID()}@example.test`;

    await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)`,
      [email.toLowerCase(), "synthetic-test-password-hash", "First User"],
    );

    await expectSqlState(
      pool.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)`,
        [email.toUpperCase(), "synthetic-test-password-hash", "Second User"],
      ),
      "23505",
    );

    await pool.query("DELETE FROM users WHERE lower(email) = lower($1)", [
      email,
    ]);
  });

  it("enforces unique role assignments for the same user", async () => {
    const userId = await createUser();

    try {
      await pool.query(
        `INSERT INTO role_assignments (user_id, role)
         VALUES ($1, 'student')`,
        [userId],
      );

      await expectSqlState(
        pool.query(
          `INSERT INTO role_assignments (user_id, role)
           VALUES ($1, 'student')`,
          [userId],
        ),
        "23505",
      );

      // A different role for the same user remains allowed.
      await pool.query(
        `INSERT INTO role_assignments (user_id, role)
         VALUES ($1, 'teacher')`,
        [userId],
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("enforces unique session and verification token hashes", async () => {
    const userId = await createUser();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const sessionHash = `session-${randomUUID()}`;
    const verificationHash = `verification-${randomUUID()}`;

    try {
      await pool.query(
        `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, sessionHash, expiresAt],
      );

      await expectSqlState(
        pool.query(
          `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [userId, sessionHash, expiresAt],
        ),
        "23505",
      );

      await pool.query(
        `INSERT INTO verification_tokens
           (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'email_verification', $3)`,
        [userId, verificationHash, expiresAt],
      );

      await expectSqlState(
        pool.query(
          `INSERT INTO verification_tokens
             (user_id, token_hash, purpose, expires_at)
           VALUES ($1, $2, 'password_reset', $3)`,
          [userId, verificationHash, expiresAt],
        ),
        "23505",
      );

      // Multiple distinct sessions and tokens per user are allowed.
      await pool.query(
        `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, `session-${randomUUID()}`, expiresAt],
      );

      await pool.query(
        `INSERT INTO verification_tokens
           (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'password_reset', $3)`,
        [userId, `verification-${randomUUID()}`, expiresAt],
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("rejects child records whose user does not exist", async () => {
    const missingUserId = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await expectSqlState(
      pool.query(
        `INSERT INTO role_assignments (user_id, role)
         VALUES ($1, 'student')`,
        [missingUserId],
      ),
      "23503",
    );

    await expectSqlState(
      pool.query(
        `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [missingUserId, `session-${randomUUID()}`, expiresAt],
      ),
      "23503",
    );

    await expectSqlState(
      pool.query(
        `INSERT INTO verification_tokens
           (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'email_verification', $3)`,
        [missingUserId, `verification-${randomUUID()}`, expiresAt],
      ),
      "23503",
    );
  });

  it("cascades user deletion to role, session, and verification records", async () => {
    const userId = await createUser();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO role_assignments (user_id, role)
       VALUES ($1, 'student')`,
      [userId],
    );

    await pool.query(
      `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, `session-${randomUUID()}`, expiresAt],
    );

    await pool.query(
      `INSERT INTO verification_tokens
         (user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, 'email_verification', $3)`,
      [userId, `verification-${randomUUID()}`, expiresAt],
    );

    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    const result = await pool.query<{ child_count: string }>(
      `SELECT
         (SELECT count(*) FROM role_assignments WHERE user_id = $1)
         + (SELECT count(*) FROM auth_sessions WHERE user_id = $1)
         + (SELECT count(*) FROM verification_tokens WHERE user_id = $1)
         AS child_count`,
      [userId],
    );

    expect(Number(result.rows[0].child_count)).toBe(0);
  });
});
