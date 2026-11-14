import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createDatabase,
  type Database,
} from "../../infrastructure/database/client.js";
import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import { users } from "../../infrastructure/database/schema/users.js";
import {
  createIdentityRepository,
  DuplicateEmailError,
  type CreateIdentityUserInput,
} from "./identity.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createIdentityRepository(database);
const createdEmails: string[] = [];

function makeUserInput(): CreateIdentityUserInput {
  return {
    email: `identity-${randomUUID()}@example.test`,
    displayName: "Integration Test User",
    passwordHash: "$argon2id$synthetic-integration-test-hash",
  };
}

async function cleanUpCreatedUsers(): Promise<void> {
  if (createdEmails.length === 0) {
    return;
  }

  await pool.query("DELETE FROM users WHERE lower(email) = ANY($1::text[])", [
    createdEmails.map((email) => email.trim().toLowerCase()),
  ]);

  createdEmails.length = 0;
}

describe("identity repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Identity repository integration tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    await cleanUpCreatedUsers();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a user, assigns student, and finds by normalized email", async () => {
    const input = makeUserInput();
    const email = input.email.toLowerCase();
    createdEmails.push(email);

    const user = await repository.createUser({
      ...input,
      email: `  ${input.email.toUpperCase()}  `,
    });

    expect(user).toEqual({
      id: expect.any(String),
      email,
      displayName: input.displayName,
    });
    expect(user).not.toHaveProperty("passwordHash");

    const storedPassword = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id],
    );
    expect(storedPassword.rows[0].password_hash).toBe(input.passwordHash);

    const assignedRoles = await pool.query<{ role: string }>(
      "SELECT role FROM role_assignments WHERE user_id = $1",
      [user.id],
    );
    expect(assignedRoles.rows.map(({ role }) => role)).toEqual(["student"]);

    await expect(
      repository.findUserByEmail(` ${input.email.toUpperCase()} `),
    ).resolves.toEqual(user);
  });

  it("rejects duplicate emails case-insensitively through the unique constraint", async () => {
    const input = makeUserInput();
    createdEmails.push(input.email.toLowerCase());

    await repository.createUser(input);

    await expect(
      repository.createUser({
        ...input,
        email: input.email.toUpperCase(),
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);

    const userCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM users WHERE lower(email) = lower($1)",
      [input.email],
    );
    const roleCount = await pool.query<{ count: string }>(
      `SELECT count(*)
       FROM role_assignments AS assignments
       JOIN users ON users.id = assignments.user_id
       WHERE lower(users.email) = lower($1)`,
      [input.email],
    );

    expect(Number(userCount.rows[0].count)).toBe(1);
    expect(Number(roleCount.rows[0].count)).toBe(1);
  });

  it("rolls back the inserted user if student role assignment fails", async () => {
    const input = makeUserInput();
    const functionName = `fail_role_insert_${randomUUID().replaceAll("-", "")}`;
    const triggerName = `fail_role_insert_${randomUUID().replaceAll("-", "")}`;
    const rollbackSignal = new Error("Rollback test transaction");

    await expect(
      database.transaction(async (transaction) => {
        await transaction.execute(sql`
          CREATE FUNCTION ${sql.identifier(functionName)}()
          RETURNS trigger
          LANGUAGE plpgsql
          AS $function$
          BEGIN
            RAISE EXCEPTION 'Intentional role assignment failure for test';
          END;
          $function$
        `);

        await transaction.execute(sql`
          CREATE TRIGGER ${sql.identifier(triggerName)}
          BEFORE INSERT ON ${roleAssignments}
          FOR EACH ROW
          EXECUTE FUNCTION ${sql.identifier(functionName)}()
        `);

        const transactionRepository = createIdentityRepository(
          transaction as unknown as Database,
        );

        await expect(transactionRepository.createUser(input)).rejects.toThrow();

        const insertedUsers = await transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email));

        expect(insertedUsers).toHaveLength(0);

        // Roll back the temporary test trigger and function as well.
        throw rollbackSignal;
      }),
    ).rejects.toBe(rollbackSignal);
  });
});
