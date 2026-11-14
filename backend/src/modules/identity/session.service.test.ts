import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { AuthSession, CreateSessionInput } from "./session.repository.js";
import {
  createSessionService,
  type SessionRepository,
} from "./session.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const sessionId = "2a21a7aa-e5b2-4f96-a9b7-e45929c834d1";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

const activeSession: AuthSession = {
  id: sessionId,
  userId,
  createdAt: fixedNow,
  expiresAt: new Date("2026-01-08T00:00:00.000Z"),
  revokedAt: null,
  lastActivityAt: fixedNow,
};

function createRepositoryMock() {
  return {
    createSession: vi.fn(
      async (input: CreateSessionInput): Promise<AuthSession> => ({
        ...activeSession,
        userId: input.userId,
        expiresAt: input.expiresAt,
      }),
    ),
    touchActiveSession: vi.fn(
      async (): Promise<AuthSession | null> => activeSession,
    ),
    revokeSessionByTokenHash: vi.fn(async () => true),
    revokeAllSessionsForUser: vi.fn(async () => 2),
  } satisfies SessionRepository;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

describe("session service", () => {
  it("generates a secure token and stores only its SHA-256 hash", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });

    const created = await service.createSession(userId);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.session).not.toHaveProperty("sessionTokenHash");
    expect(repository.createSession).toHaveBeenCalledWith({
      userId,
      sessionTokenHash: hashToken(created.token),
      expiresAt: new Date(fixedNow.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    expect(repository.createSession.mock.calls[0][0].sessionTokenHash).not.toBe(
      created.token,
    );
  });

  it("validates an active session using the token hash", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });
    const token = "A".repeat(43);

    await expect(service.validateSession(token)).resolves.toEqual(
      activeSession,
    );
    expect(repository.touchActiveSession).toHaveBeenCalledWith(
      hashToken(token),
    );
  });

  it.each(["expired", "revoked"])(
    "rejects a %s session when the repository reports it inactive",
    async () => {
      const repository = createRepositoryMock();
      repository.touchActiveSession.mockResolvedValue(null);
      const service = createSessionService(repository, {
        sessionLifetimeSeconds: 7 * 24 * 60 * 60,
        now: () => fixedNow,
      });

      await expect(service.validateSession("A".repeat(43))).resolves.toBeNull();
    },
  );

  it("rejects tokens that were not generated in the expected format", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });

    await expect(
      service.validateSession("not-a-session-token"),
    ).resolves.toBeNull();
    expect(repository.touchActiveSession).not.toHaveBeenCalled();
  });

  it("revokes one session using its hash", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });
    const token = "B".repeat(43);

    await expect(service.revokeSession(token)).resolves.toBe(true);
    expect(repository.revokeSessionByTokenHash).toHaveBeenCalledWith(
      hashToken(token),
    );
  });

  it("revokes all sessions for a user through the repository", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });

    await expect(service.revokeAllSessionsForUser(userId)).resolves.toBe(2);
    expect(repository.revokeAllSessionsForUser).toHaveBeenCalledWith(userId);
  });

  it("rejects an invalid configured lifetime", () => {
    const repository = createRepositoryMock();

    expect(() =>
      createSessionService(repository, {
        sessionLifetimeSeconds: 0,
      }),
    ).toThrow(RangeError);
  });

  it("allows multiple concurrent sessions for the same user", async () => {
    const repository = createRepositoryMock();
    const service = createSessionService(repository, {
      sessionLifetimeSeconds: 7 * 24 * 60 * 60,
      now: () => fixedNow,
    });

    const [first, second] = await Promise.all([
      service.createSession(userId),
      service.createSession(userId),
    ]);

    expect(first.token).not.toBe(second.token);
    expect(repository.createSession).toHaveBeenCalledTimes(2);

    const storedHashes = repository.createSession.mock.calls.map(
      ([input]) => input.sessionTokenHash,
    );
    expect(new Set(storedHashes).size).toBe(2);
  });
});
