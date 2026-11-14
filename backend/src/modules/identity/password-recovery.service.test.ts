import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createPasswordRecoveryService,
  InvalidVerificationTokenError,
} from "./password-recovery.service.js";
import type { IdentityUser } from "./identity.repository.js";

const user = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "student@example.test",
  displayName: "Synthetic Student",
};

const issuedToken = {
  token: "synthetic-password-reset-token",
  expiresAt: new Date("2026-01-02T00:00:00.000Z"),
};

function createDependencies() {
  return {
    identityRepository: {
      findUserByEmail: vi.fn(async (): Promise<IdentityUser | null> => user),
    },
    tokenService: {
      issueToken: vi.fn(async () => issuedToken),
      consumePasswordResetToken: vi.fn(async () => {}),
    },
    emailService: {
      send: vi.fn(async () => {}),
    },
    frontendUrl: "http://localhost:5173",
    hashPassword: vi.fn(async () => "$argon2id$synthetic-new-hash"),
  };
}

describe("password recovery service", () => {
  it("returns the same request response for unknown and registered emails", async () => {
    const registeredDependencies = createDependencies();
    const registeredService = createPasswordRecoveryService(
      registeredDependencies,
    );
    const registeredResponse = await registeredService.requestReset(
      " STUDENT@example.test ",
    );

    const unknownDependencies = createDependencies();
    unknownDependencies.identityRepository.findUserByEmail.mockResolvedValue(
      null,
    );
    const unknownService = createPasswordRecoveryService(unknownDependencies);
    const unknownResponse = await unknownService.requestReset(
      "unknown@example.test",
    );

    expect(registeredResponse).toEqual(unknownResponse);
    expect(registeredResponse).toEqual({
      message:
        "If an account exists for that email, a password reset link will be sent.",
    });
    expect(
      registeredDependencies.identityRepository.findUserByEmail,
    ).toHaveBeenCalledWith("student@example.test");
    expect(registeredDependencies.tokenService.issueToken).toHaveBeenCalledWith(
      user.id,
      "password_reset",
    );
    expect(registeredDependencies.emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        text: expect.stringContaining(
          "http://localhost:5173/reset-password?token=synthetic-password-reset-token",
        ),
      }),
    );
    expect(unknownDependencies.tokenService.issueToken).not.toHaveBeenCalled();
    expect(unknownDependencies.emailService.send).not.toHaveBeenCalled();
  });

  it("returns the same public response when email delivery fails", async () => {
    const dependencies = createDependencies();
    dependencies.emailService.send.mockRejectedValue(
      new Error("SMTP failure containing synthetic credentials"),
    );
    const service = createPasswordRecoveryService(dependencies);

    await expect(service.requestReset(user.email)).resolves.toEqual({
      message:
        "If an account exists for that email, a password reset link will be sent.",
    });
  });

  it("hashes a valid new password and delegates atomic token consumption", async () => {
    const dependencies = createDependencies();
    const service = createPasswordRecoveryService(dependencies);

    await expect(
      service.resetPassword(
        "synthetic-password-reset-token",
        "a sufficiently long new passphrase",
      ),
    ).resolves.toEqual({ message: "Password has been reset." });

    expect(dependencies.hashPassword).toHaveBeenCalledWith(
      "a sufficiently long new passphrase",
    );
    expect(
      dependencies.tokenService.consumePasswordResetToken,
    ).toHaveBeenCalledWith(
      "synthetic-password-reset-token",
      "$argon2id$synthetic-new-hash",
    );
  });

  it("rejects a password that does not meet registration requirements", async () => {
    const dependencies = createDependencies();
    const service = createPasswordRecoveryService(dependencies);

    await expect(
      service.resetPassword("synthetic-token", "short"),
    ).rejects.toBeInstanceOf(ZodError);

    expect(dependencies.hashPassword).not.toHaveBeenCalled();
    expect(
      dependencies.tokenService.consumePasswordResetToken,
    ).not.toHaveBeenCalled();
  });

  it("propagates invalid, expired, consumed, and wrong-purpose token failures", async () => {
    const dependencies = createDependencies();
    dependencies.tokenService.consumePasswordResetToken.mockRejectedValue(
      new InvalidVerificationTokenError(),
    );
    const service = createPasswordRecoveryService(dependencies);

    await expect(
      service.resetPassword(
        "synthetic-invalid-token",
        "a sufficiently long new passphrase",
      ),
    ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
  });
});
