import { describe, expect, it, vi } from "vitest";

import type { IdentityLoginUser } from "./identity.repository.js";
import {
  createLoginService,
  InvalidCredentialsError,
  LoginSessionCreationError,
} from "./login.service.js";
import type { CreatedSession } from "./session.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const sessionId = "2a21a7aa-e5b2-4f96-a9b7-e45929c834d1";
const passwordHash = "$argon2id$synthetic-password-hash";
const submittedPassword = "synthetic valid passphrase";

const activeVerifiedUser: IdentityLoginUser = {
  id: userId,
  email: "student@example.test",
  displayName: "Synthetic Student",
  passwordHash,
  accountStatus: "active",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const createdSession: CreatedSession = {
  token: "A".repeat(43),
  session: {
    id: sessionId,
    userId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-08T00:00:00.000Z"),
    revokedAt: null,
    lastActivityAt: new Date("2026-01-01T00:00:00.000Z"),
  },
};

function createDependencies(
  user: IdentityLoginUser | null = activeVerifiedUser,
) {
  const identityRepository = {
    findUserForLogin: vi.fn(async () => user),
  };
  const verifyPassword = vi.fn(async () => true);
  const hashPassword = vi.fn(async () => "$argon2id$synthetic-dummy-hash");
  const sessionService = {
    createSession: vi.fn(async () => createdSession),
  };

  return {
    identityRepository,
    verifyPassword,
    hashPassword,
    sessionService,
  };
}

describe("login service", () => {
  it("normalizes email, verifies the password, and creates a session", async () => {
    const dependencies = createDependencies();
    const service = createLoginService(dependencies);

    const result = await service.login({
      email: "  STUDENT@Example.Test ",
      password: submittedPassword,
    });

    expect(
      dependencies.identityRepository.findUserForLogin,
    ).toHaveBeenCalledWith("student@example.test");
    expect(dependencies.verifyPassword).toHaveBeenCalledWith(
      submittedPassword,
      passwordHash,
    );
    expect(dependencies.sessionService.createSession).toHaveBeenCalledWith(
      userId,
    );
    expect(result).toEqual({
      user: {
        id: userId,
        email: "student@example.test",
        displayName: "Synthetic Student",
      },
      sessionToken: createdSession.token,
      sessionExpiresAt: createdSession.session.expiresAt,
    });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.user).not.toHaveProperty("password");
  });

  it("uses the dummy hash and returns the same error for an unknown email", async () => {
    const dependencies = createDependencies(null);
    const service = createLoginService(dependencies);

    await expect(
      service.login({
        email: "unknown@example.test",
        password: submittedPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(dependencies.verifyPassword).toHaveBeenCalledWith(
      submittedPassword,
      "$argon2id$synthetic-dummy-hash",
    );
    expect(dependencies.sessionService.createSession).not.toHaveBeenCalled();
  });

  it("returns the generic credentials error for a wrong password", async () => {
    const dependencies = createDependencies();
    dependencies.verifyPassword.mockResolvedValue(false);
    const service = createLoginService(dependencies);

    await expect(
      service.login({
        email: activeVerifiedUser.email,
        password: "incorrect synthetic passphrase",
      }),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(dependencies.sessionService.createSession).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "inactive account",
      user: { ...activeVerifiedUser, accountStatus: "disabled" },
    },
    {
      label: "unverified email",
      user: { ...activeVerifiedUser, emailVerifiedAt: null },
    },
  ])(
    "rejects an $label with the generic credentials error",
    async ({ user }) => {
      const dependencies = createDependencies(user);
      const service = createLoginService(dependencies);

      await expect(
        service.login({
          email: user.email,
          password: submittedPassword,
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(dependencies.sessionService.createSession).not.toHaveBeenCalled();
    },
  );

  it("maps session creation failure to a generic login failure", async () => {
    const dependencies = createDependencies();
    dependencies.sessionService.createSession.mockRejectedValue(
      new Error("database details must not escape"),
    );
    const service = createLoginService(dependencies);

    let caughtError: unknown;
    try {
      await service.login({
        email: activeVerifiedUser.email,
        password: submittedPassword,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(LoginSessionCreationError);
    expect(String(caughtError)).not.toContain("database details");
    expect(caughtError).not.toHaveProperty("cause");
  });

  it("does not create a session for an invalid request body", async () => {
    const dependencies = createDependencies();
    const service = createLoginService(dependencies);

    await expect(
      service.login({ email: "not-an-email", password: "short" }),
    ).rejects.toThrow();

    expect(
      dependencies.identityRepository.findUserForLogin,
    ).not.toHaveBeenCalled();
    expect(dependencies.sessionService.createSession).not.toHaveBeenCalled();
  });
});
