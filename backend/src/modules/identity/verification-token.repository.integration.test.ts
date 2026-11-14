import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { users } from "../../infrastructure/database/schema/users.js";
import { verificationTokens } from "../../infrastructure/database/schema/verification-tokens.js";
import { createVerificationTokenRepository } from "./verification-token.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createVerificationTokenRepository(database);
const createdUserIds: string[] = [];

async function createTestUser(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `token-${randomUUID()}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Verification Token Test User",
    ],
  );

  const userId = result.rows[0].id;
  createdUserIds.push(userId);
  return userId;
}

function makeTokenHash(): string {
  return createHash("sha256").update(randomUUID()).digest("hex");
}

describe("verification token repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Verification token repository tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores a token hash and consumes a valid token once", async () => {
    const userId = await createTestUser();
    const tokenHash = makeTokenHash();

    await repository.create({
      userId,
      tokenHash,
      purpose: "email_verification",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const storedTokens = await pool.query<{
      token_hash: string;
      consumed_at: Date | null;
    }>(
      `SELECT token_hash, consumed_at
       FROM verification_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    expect(storedTokens.rows).toHaveLength(1);
    expect(storedTokens.rows[0].token_hash).toBe(tokenHash);
    expect(storedTokens.rows[0].consumed_at).toBeNull();

    await expect(
      repository.consume(tokenHash, "email_verification"),
    ).resolves.toEqual({
      userId,
      purpose: "email_verification",
    });

    await expect(
      repository.consume(tokenHash, "email_verification"),
    ).resolves.toBeNull();

    const consumedTokens = await pool.query<{ consumed_at: Date | null }>(
      "SELECT consumed_at FROM verification_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    expect(consumedTokens.rows[0].consumed_at).toBeInstanceOf(Date);
  });

  it("rejects expired, consumed, and wrong-purpose tokens", async () => {
    const userId = await createTestUser();
    const expiredHash = makeTokenHash();
    const consumedHash = makeTokenHash();
    const wrongPurposeHash = makeTokenHash();

    await database.insert(verificationTokens).values([
      {
        userId,
        tokenHash: expiredHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
      {
        userId,
        tokenHash: consumedHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        consumedAt: new Date(),
      },
      {
        userId,
        tokenHash: wrongPurposeHash,
        purpose: "email_verification",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    ]);

    await expect(
      repository.consume(expiredHash, "email_verification"),
    ).resolves.toBeNull();

    await expect(
      repository.consume(consumedHash, "email_verification"),
    ).resolves.toBeNull();

    await expect(
      repository.consume(wrongPurposeHash, "password_reset"),
    ).resolves.toBeNull();

    // A wrong-purpose attempt does not consume a token for its actual purpose.
    await expect(
      repository.consume(wrongPurposeHash, "email_verification"),
    ).resolves.toMatchObject({ userId, purpose: "email_verification" });
  });

  it("allows only one winner when consumption is concurrent", async () => {
    const userId = await createTestUser();
    const tokenHash = makeTokenHash();

    await repository.create({
      userId,
      tokenHash,
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const results = await Promise.all([
      repository.consume(tokenHash, "password_reset"),
      repository.consume(tokenHash, "password_reset"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });

  it("atomically consumes an email token and marks the user verified once", async () => {
    const userId = await createTestUser();
    const tokenHash = makeTokenHash();

    await repository.create({
      userId,
      tokenHash,
      purpose: "email_verification",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const firstResult =
      await repository.consumeEmailVerificationToken(tokenHash);
    expect(firstResult).toMatchObject({ userId });
    expect(firstResult?.emailVerifiedAt).toBeInstanceOf(Date);

    const [storedUser] = await database
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId));
    expect(storedUser.emailVerifiedAt).toEqual(firstResult?.emailVerifiedAt);

    await expect(
      repository.consumeEmailVerificationToken(tokenHash),
    ).resolves.toBeNull();

    const [token] = await database
      .select({ consumedAt: verificationTokens.consumedAt })
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash));
    expect(token.consumedAt).toBeInstanceOf(Date);
  });

  it("does not consume a password-reset token as an email verification token", async () => {
    const userId = await createTestUser();
    const tokenHash = makeTokenHash();

    await repository.create({
      userId,
      tokenHash,
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      repository.consumeEmailVerificationToken(tokenHash),
    ).resolves.toBeNull();
    const [token] = await database
      .select({ consumedAt: verificationTokens.consumedAt })
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash));
    expect(token.consumedAt).toBeNull();
  });
});
