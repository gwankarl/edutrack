import { describe, expect, it, vi } from "vitest";

import type { EmailService } from "../../infrastructure/email/email.service.js";
import {
  createEmailVerificationService,
  EmailVerificationDeliveryError,
} from "./email-verification.service.js";
import { InvalidVerificationTokenError } from "./verification-token.service.js";

const verificationToken = "synthetic-email-verification-token";
const verifiedUser = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function createDependencies() {
  const tokenService = {
    issueToken: vi.fn(async () => ({
      token: verificationToken,
      expiresAt: new Date("2026-01-02T00:00:00.000Z"),
    })),
    consumeEmailVerificationToken: vi.fn(async () => verifiedUser),
  };
  const emailService: EmailService = {
    send: vi.fn(async () => {}),
  };

  return { tokenService, emailService };
}

describe("email verification service", () => {
  it("issues an email verification token and sends a frontend link", async () => {
    const dependencies = createDependencies();
    const service = createEmailVerificationService({
      ...dependencies,
      frontendUrl: "http://localhost:5173",
    });

    await service.sendVerificationEmail({
      id: verifiedUser.userId,
      email: "student@example.test",
    });

    expect(dependencies.tokenService.issueToken).toHaveBeenCalledWith(
      verifiedUser.userId,
      "email_verification",
    );
    expect(dependencies.emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "student@example.test",
        text: expect.stringContaining(
          `http://localhost:5173/verify-email?token=${verificationToken}`,
        ),
        html: expect.stringContaining(
          `http://localhost:5173/verify-email?token=${verificationToken}`,
        ),
      }),
    );
  });

  it("delegates verification to the atomic token consumption operation", async () => {
    const dependencies = createDependencies();
    const service = createEmailVerificationService({
      ...dependencies,
      frontendUrl: "http://localhost:5173",
    });

    await expect(service.verifyEmail(verificationToken)).resolves.toEqual(
      verifiedUser,
    );
    expect(
      dependencies.tokenService.consumeEmailVerificationToken,
    ).toHaveBeenCalledWith(verificationToken);
  });

  it("does not reveal transport details or the raw token when email delivery fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.emailService.send).mockRejectedValue(
      new Error("SMTP auth failed with synthetic-secret"),
    );
    const service = createEmailVerificationService({
      ...dependencies,
      frontendUrl: "http://localhost:5173",
    });

    let caughtError: unknown;
    try {
      await service.sendVerificationEmail({
        id: verifiedUser.userId,
        email: "student@example.test",
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(EmailVerificationDeliveryError);
    expect(String(caughtError)).not.toContain(verificationToken);
    expect(String(caughtError)).not.toContain("synthetic-secret");
    expect(caughtError).not.toHaveProperty("cause");
  });

  it("rejects invalid, expired, consumed, or wrong-purpose tokens consistently", async () => {
    const dependencies = createDependencies();
    dependencies.tokenService.consumeEmailVerificationToken.mockRejectedValue(
      new InvalidVerificationTokenError(),
    );
    const service = createEmailVerificationService({
      ...dependencies,
      frontendUrl: "http://localhost:5173",
    });

    await expect(service.verifyEmail(verificationToken)).rejects.toBeInstanceOf(
      InvalidVerificationTokenError,
    );
  });

  it("rejects a repeated request after the token service reports it consumed", async () => {
    const dependencies = createDependencies();
    dependencies.tokenService.consumeEmailVerificationToken
      .mockResolvedValueOnce(verifiedUser)
      .mockRejectedValueOnce(new InvalidVerificationTokenError());
    const service = createEmailVerificationService({
      ...dependencies,
      frontendUrl: "http://localhost:5173",
    });

    await expect(service.verifyEmail(verificationToken)).resolves.toEqual(
      verifiedUser,
    );
    await expect(service.verifyEmail(verificationToken)).rejects.toBeInstanceOf(
      InvalidVerificationTokenError,
    );
    expect(
      dependencies.tokenService.consumeEmailVerificationToken,
    ).toHaveBeenCalledTimes(2);
  });
});
