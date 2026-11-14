import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { authSessions } from "../../infrastructure/database/schema/auth-sessions.js";

export interface CreateSessionInput {
  userId: string;
  /** This must be a hash produced by the session service, never a raw token. */
  sessionTokenHash: string;
  expiresAt: Date;
}

const safeSessionSelection = {
  id: authSessions.id,
  userId: authSessions.userId,
  createdAt: authSessions.createdAt,
  expiresAt: authSessions.expiresAt,
  revokedAt: authSessions.revokedAt,
  lastActivityAt: authSessions.lastActivityAt,
};

export type AuthSession = Pick<
  typeof authSessions.$inferSelect,
  "id" | "userId" | "createdAt" | "expiresAt" | "revokedAt" | "lastActivityAt"
>;

export function createSessionRepository(database: Database) {
  return {
    async createSession(input: CreateSessionInput): Promise<AuthSession> {
      const [session] = await database
        .insert(authSessions)
        .values(input)
        .returning(safeSessionSelection);

      if (!session) {
        throw new Error("Session insert did not return a row.");
      }

      return session;
    },

    async findActiveSessionByTokenHash(
      sessionTokenHash: string,
    ): Promise<AuthSession | null> {
      const [session] = await database
        .select(safeSessionSelection)
        .from(authSessions)
        .where(
          and(
            eq(authSessions.sessionTokenHash, sessionTokenHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, sql<Date>`now()`),
          ),
        )
        .limit(1);

      return session ?? null;
    },

    /**
     * Updates activity only if the session is still active.
     * Call this when the authentication service decides activity should be recorded.
     */
    async touchActiveSession(
      sessionTokenHash: string,
    ): Promise<AuthSession | null> {
      const [session] = await database
        .update(authSessions)
        .set({ lastActivityAt: sql<Date>`now()` })
        .where(
          and(
            eq(authSessions.sessionTokenHash, sessionTokenHash),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, sql<Date>`now()`),
          ),
        )
        .returning(safeSessionSelection);

      return session ?? null;
    },

    async revokeSessionByTokenHash(sessionTokenHash: string): Promise<boolean> {
      const revoked = await database
        .update(authSessions)
        .set({ revokedAt: sql<Date>`now()` })
        .where(
          and(
            eq(authSessions.sessionTokenHash, sessionTokenHash),
            isNull(authSessions.revokedAt),
          ),
        )
        .returning({ id: authSessions.id });

      return revoked.length > 0;
    },

    async revokeAllSessionsForUser(userId: string): Promise<number> {
      const revoked = await database
        .update(authSessions)
        .set({ revokedAt: sql<Date>`now()` })
        .where(
          and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)),
        )
        .returning({ id: authSessions.id });

      return revoked.length;
    },
  };
}
