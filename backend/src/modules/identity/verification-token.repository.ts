import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import {
  verificationTokenPurpose,
  verificationTokens,
} from "../../infrastructure/database/schema/verification-tokens.js";
import { users } from "../../infrastructure/database/schema/users.js";
import { authSessions } from "../../infrastructure/database/schema/auth-sessions.js";

export type VerificationTokenPurpose =
  (typeof verificationTokenPurpose.enumValues)[number];

export interface CreateVerificationTokenRecord {
  userId: string;
  tokenHash: string;
  purpose: VerificationTokenPurpose;
  expiresAt: Date;
}

export type ConsumedVerificationToken = Pick<
  typeof verificationTokens.$inferSelect,
  "userId" | "purpose"
>;

export function createVerificationTokenRepository(database: Database) {
  return {
    async create(input: CreateVerificationTokenRecord): Promise<void> {
      await database.insert(verificationTokens).values(input);
    },

    async consume(
      tokenHash: string,
      purpose: VerificationTokenPurpose,
    ): Promise<ConsumedVerificationToken | null> {
      const [consumedToken] = await database
        .update(verificationTokens)
        .set({
          consumedAt: sql<Date>`now()`,
        })
        .where(
          and(
            eq(verificationTokens.tokenHash, tokenHash),
            eq(verificationTokens.purpose, purpose),
            isNull(verificationTokens.consumedAt),
            gt(verificationTokens.expiresAt, sql<Date>`now()`),
          ),
        )
        .returning({
          userId: verificationTokens.userId,
          purpose: verificationTokens.purpose,
        });

      return consumedToken ?? null;
    },

    async consumeEmailVerificationToken(
      tokenHash: string,
    ): Promise<{ userId: string; emailVerifiedAt: Date } | null> {
      return database.transaction(async (transaction) => {
        const [consumedToken] = await transaction
          .update(verificationTokens)
          .set({
            consumedAt: sql<Date>`now()`,
          })
          .where(
            and(
              eq(verificationTokens.tokenHash, tokenHash),
              eq(verificationTokens.purpose, "email_verification"),
              isNull(verificationTokens.consumedAt),
              gt(verificationTokens.expiresAt, sql<Date>`now()`),
            ),
          )
          .returning({
            userId: verificationTokens.userId,
          });

        if (!consumedToken) {
          return null;
        }

        const [verifiedUser] = await transaction
          .update(users)
          .set({
            emailVerifiedAt: sql<Date>`coalesce(${users.emailVerifiedAt}, now())`,
            updatedAt: sql<Date>`now()`,
          })
          .where(eq(users.id, consumedToken.userId))
          .returning({
            id: users.id,
            emailVerifiedAt: users.emailVerifiedAt,
          });

        if (!verifiedUser?.emailVerifiedAt) {
          // Throwing rolls back the token consumption too.
          throw new Error("The verification token's user no longer exists.");
        }

        return {
          userId: verifiedUser.id,
          emailVerifiedAt: verifiedUser.emailVerifiedAt,
        };
      });
    },

    async consumePasswordResetToken(
      tokenHash: string,
      passwordHash: string,
    ): Promise<{ userId: string } | null> {
      return database.transaction(async (transaction) => {
        const [consumedToken] = await transaction
          .update(verificationTokens)
          .set({ consumedAt: sql<Date>`now()` })
          .where(
            and(
              eq(verificationTokens.tokenHash, tokenHash),
              eq(verificationTokens.purpose, "password_reset"),
              isNull(verificationTokens.consumedAt),
              gt(verificationTokens.expiresAt, sql<Date>`now()`),
            ),
          )
          .returning({ userId: verificationTokens.userId });

        if (!consumedToken) {
          return null;
        }

        const [updatedUser] = await transaction
          .update(users)
          .set({
            passwordHash,
            updatedAt: sql<Date>`now()`,
          })
          .where(eq(users.id, consumedToken.userId))
          .returning({ id: users.id });

        if (!updatedUser) {
          // Roll back the token consumption if the user no longer exists.
          throw new Error("The password reset token's user no longer exists.");
        }

        await transaction
          .update(authSessions)
          .set({ revokedAt: sql<Date>`now()` })
          .where(
            and(
              eq(authSessions.userId, updatedUser.id),
              isNull(authSessions.revokedAt),
            ),
          );

        return { userId: updatedUser.id };
      });
    },
  };
}
