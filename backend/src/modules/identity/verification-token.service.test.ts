import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createVerificationTokenService,
  InvalidVerificationTokenError,
  type VerificationTokenRepository,
} from "./verification-token.service.js";
import type {
  ConsumedVerificationToken,
  CreateVerificationTokenRecord,
} from "./verification-token.repository.js";

const fixedNow = new Date("2026-01-01T00:00:00.000Z");

function createRepositoryMock() {
  return {
    create: vi.fn(async (input: CreateVerificationTokenRecord) => {
      void input;
    }),
    consume: vi.fn(async (): Promise<ConsumedVerificationToken | null> => ({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      purpose: "email_verification",
    })),
    consumeEmailVerificationToken: vi.fn(
      async (): Promise<{ userId: string; emailVerifiedAt: Date } | null> => ({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        emailVerifiedAt: fixedNow,
      }),
    ),
    consumePasswordResetToken: vi.fn(
      async (): Promise<{ userId: string } | null> => ({
        userId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ),
  } satisfies VerificationTokenRepository;
}

describe("verification token service", () => {
  it("creates a random token and stores only its SHA-256 hash", async () => {
    const repository = createRepositoryMock();
    const service = createVerificationTokenService(repository, {
      expirationMs: {
        email_verification: 30 * 60 * 1000,
      },
      now: () => fixedNow,
    });

    const issued = await service.issueToken(
      "550e8400-e29b-41d4-a716-446655440000",
      "email_verification",
    );

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt).toEqual(
      new Date(fixedNow.getTime() + 30 * 60 * 1000),
    );
    expect(repository.create).toHaveBeenCalledWith({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      purpose: "email_verification",
      tokenHash: createHash("sha256").update(issued.token).digest("hex"),
      expiresAt: issued.expiresAt,
    });

    const storedInput = repository.create.mock.calls[0][0];
    expect(storedInput).not.toHaveProperty("token");
    expect(storedInput.tokenHash).not.toBe(issued.token);
  });

  it("uses the password-reset expiration setting", async () => {
    const repository = createRepositoryMock();
    const service = createVerificationTokenService(repository, {
      expirationMs: {
        password_reset: 15 * 60 * 1000,
      },
      now: () => fixedNow,
    });

    const issued = await service.issueToken(
      "550e8400-e29b-41d4-a716-446655440000",
      "password_reset",
    );

    expect(issued.expiresAt).toEqual(
      new Date(fixedNow.getTime() + 15 * 60 * 1000),
    );
  });

  it("hashes the supplied token before asking the repository to consume it", async () => {
    const repository = createRepositoryMock();
    const service = createVerificationTokenService(repository);
    const rawToken = "synthetic-token-for-unit-test";

    await service.consumeToken(rawToken, "email_verification");

    expect(repository.consume).toHaveBeenCalledWith(
      createHash("sha256").update(rawToken).digest("hex"),
      "email_verification",
    );
  });

  it("rejects tokens the repository cannot consume", async () => {
    const repository = createRepositoryMock();
    repository.consume.mockResolvedValue(null);

    const service = createVerificationTokenService(repository);

    await expect(
      service.consumeToken("synthetic-invalid-token", "password_reset"),
    ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
  });

  it("hashes and atomically consumes an email verification token", async () => {
    const repository = createRepositoryMock();
    const service = createVerificationTokenService(repository);
    const rawToken = "synthetic-email-token";

    await expect(
      service.consumeEmailVerificationToken(rawToken),
    ).resolves.toEqual({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      emailVerifiedAt: fixedNow,
    });

    expect(repository.consumeEmailVerificationToken).toHaveBeenCalledWith(
      createHash("sha256").update(rawToken).digest("hex"),
    );
  });

  it("rejects an unavailable email verification token", async () => {
    const repository = createRepositoryMock();
    repository.consumeEmailVerificationToken.mockResolvedValue(null);
    const service = createVerificationTokenService(repository);

    await expect(
      service.consumeEmailVerificationToken("synthetic-invalid-token"),
    ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
  });

  it("rejects nonpositive configured expiration", () => {
    const repository = createRepositoryMock();

    expect(() =>
      createVerificationTokenService(repository, {
        expirationMs: { password_reset: 0 },
      }),
    ).toThrow(RangeError);
  });
});
