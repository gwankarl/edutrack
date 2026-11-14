import { createHash, randomBytes } from "node:crypto";

import type {
  ConsumedVerificationToken,
  CreateVerificationTokenRecord,
  VerificationTokenPurpose,
} from "./verification-token.repository.js";

export interface VerificationTokenRepository {
  create(input: CreateVerificationTokenRecord): Promise<void>;
  consume(
    tokenHash: string,
    purpose: VerificationTokenPurpose,
  ): Promise<ConsumedVerificationToken | null>;
  consumeEmailVerificationToken(
    tokenHash: string,
  ): Promise<{ userId: string; emailVerifiedAt: Date } | null>;
  consumePasswordResetToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<{ userId: string } | null>;
}

export interface VerificationTokenServiceOptions {
  expirationMs?: Partial<Record<VerificationTokenPurpose, number>>;
  now?: () => Date;
}

export interface IssuedVerificationToken {
  /**
   * Deliver this secret through the intended email workflow.
   * Never log it or include it in an API response.
   */
  token: string;
  expiresAt: Date;
}

export class InvalidVerificationTokenError extends Error {
  constructor() {
    super("Verification token is invalid or expired.");
    this.name = "InvalidVerificationTokenError";
  }
}

const defaultExpirationMs: Record<VerificationTokenPurpose, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createVerificationTokenService(
  repository: VerificationTokenRepository,
  options: VerificationTokenServiceOptions = {},
) {
  const expirationMs = {
    ...defaultExpirationMs,
    ...options.expirationMs,
  };
  const now = options.now ?? (() => new Date());

  for (const lifetime of Object.values(expirationMs)) {
    if (!Number.isFinite(lifetime) || lifetime <= 0) {
      throw new RangeError("Token expiration must be a positive duration.");
    }
  }

  return {
    async issueToken(
      userId: string,
      purpose: VerificationTokenPurpose,
    ): Promise<IssuedVerificationToken> {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now().getTime() + expirationMs[purpose]);

      await repository.create({
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt,
      });

      return { token, expiresAt };
    },

    async consumeToken(
      token: string,
      purpose: VerificationTokenPurpose,
    ): Promise<ConsumedVerificationToken> {
      const consumedToken = await repository.consume(hashToken(token), purpose);

      if (!consumedToken) {
        throw new InvalidVerificationTokenError();
      }

      return consumedToken;
    },

    async consumeEmailVerificationToken(
      token: string,
    ): Promise<{ userId: string; emailVerifiedAt: Date }> {
      const verifiedUser = await repository.consumeEmailVerificationToken(
        hashToken(token),
      );

      if (!verifiedUser) {
        throw new InvalidVerificationTokenError();
      }

      return verifiedUser;
    },

    async consumePasswordResetToken(
      token: string,
      passwordHash: string,
    ): Promise<void> {
      const reset = await repository.consumePasswordResetToken(
        hashToken(token),
        passwordHash,
      );

      if (!reset) {
        throw new InvalidVerificationTokenError();
      }
    },
  };
}
