import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { authSessions } from "../../infrastructure/database/schema/auth-sessions.js";
import { createSessionRepository } from "./session.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createSessionRepository(database);
const createdUserIds: string[] = [];

async function createTestUser(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `session-${randomUUID()}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Session Repository Test User",
    ],
  );

  const userId = result.rows[0].id;
  createdUserIds.push(userId);
  return userId;
}

function makeSessionTokenHash(): string {
  return createHash("sha256").update(randomUUID()).digest("hex");
}

describe("session repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Session repository tests may only write to edutrack_test.",
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

  it("creates and finds an active session by its hash", async () => {
    const userId = await createTestUser();
    const sessionTokenHash = makeSessionTokenHash();

    const created = await repository.createSession({
      userId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(created.userId).toBe(userId);
    expect(created.revokedAt).toBeNull();
    expect(created).not.toHaveProperty("sessionTokenHash");

    await expect(
      repository.findActiveSessionByTokenHash(sessionTokenHash),
    ).resolves.toMatchObject({
      id: created.id,
      userId,
      revokedAt: null,
    });
  });

  it("does not find expired or revoked sessions", async () => {
    const userId = await createTestUser();
    const expiredHash = makeSessionTokenHash();
    const revokedHash = makeSessionTokenHash();

    // Seed historical states directly; the repository's create method is used
    // for new sessions and these rows represent states that already exist.
    await database.insert(authSessions).values([
      {
        userId,
        sessionTokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
      {
        userId,
        sessionTokenHash: revokedHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: new Date(),
      },
    ]);

    await expect(
      repository.findActiveSessionByTokenHash(expiredHash),
    ).resolves.toBeNull();
    await expect(
      repository.findActiveSessionByTokenHash(revokedHash),
    ).resolves.toBeNull();
  });

  it("updates activity only for an active session", async () => {
    const userId = await createTestUser();
    const sessionTokenHash = makeSessionTokenHash();

    const created = await repository.createSession({
      userId,
      sessionTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const oldActivityAt = new Date(Date.now() - 10 * 60 * 1000);
    await database
      .update(authSessions)
      .set({ lastActivityAt: oldActivityAt })
      .where(eq(authSessions.id, created.id));

    const touched = await repository.touchActiveSession(sessionTokenHash);

    expect(touched?.lastActivityAt.getTime()).toBeGreaterThan(
      oldActivityAt.getTime(),
    );

    await repository.revokeSessionByTokenHash(sessionTokenHash);
    await expect(
      repository.touchActiveSession(sessionTokenHash),
    ).resolves.toBeNull();
  });

  it("revokes one session without revoking the user's other sessions", async () => {
    const userId = await createTestUser();
    const firstHash = makeSessionTokenHash();
    const secondHash = makeSessionTokenHash();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await repository.createSession({
      userId,
      sessionTokenHash: firstHash,
      expiresAt,
    });
    await repository.createSession({
      userId,
      sessionTokenHash: secondHash,
      expiresAt,
    });

    await expect(repository.revokeSessionByTokenHash(firstHash)).resolves.toBe(
      true,
    );
    await expect(repository.revokeSessionByTokenHash(firstHash)).resolves.toBe(
      false,
    );

    await expect(
      repository.findActiveSessionByTokenHash(firstHash),
    ).resolves.toBeNull();
    await expect(
      repository.findActiveSessionByTokenHash(secondHash),
    ).resolves.toMatchObject({ userId });
  });

  it("supports concurrent sessions and revokes all sessions for only one user", async () => {
    const userId = await createTestUser();
    const otherUserId = await createTestUser();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const ownHashes = [makeSessionTokenHash(), makeSessionTokenHash()];
    const otherHash = makeSessionTokenHash();

    for (const sessionTokenHash of ownHashes) {
      await repository.createSession({
        userId,
        sessionTokenHash,
        expiresAt,
      });
    }

    await repository.createSession({
      userId: otherUserId,
      sessionTokenHash: otherHash,
      expiresAt,
    });

    expect(
      await repository.findActiveSessionByTokenHash(ownHashes[0]),
    ).toMatchObject({ userId });
    expect(
      await repository.findActiveSessionByTokenHash(ownHashes[1]),
    ).toMatchObject({ userId });

    await expect(repository.revokeAllSessionsForUser(userId)).resolves.toBe(2);

    for (const sessionTokenHash of ownHashes) {
      await expect(
        repository.findActiveSessionByTokenHash(sessionTokenHash),
      ).resolves.toBeNull();
    }

    await expect(
      repository.findActiveSessionByTokenHash(otherHash),
    ).resolves.toMatchObject({ userId: otherUserId });
  });
});
