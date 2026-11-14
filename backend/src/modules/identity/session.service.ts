import { createHash, randomBytes } from "node:crypto";

import type { AuthSession, CreateSessionInput } from "./session.repository.js";

export interface SessionRepository {
  createSession(input: CreateSessionInput): Promise<AuthSession>;
  touchActiveSession(sessionTokenHash: string): Promise<AuthSession | null>;
  revokeSessionByTokenHash(sessionTokenHash: string): Promise<boolean>;
  revokeAllSessionsForUser(userId: string): Promise<number>;
}

export interface SessionServiceOptions {
  sessionLifetimeSeconds: number;
  now?: () => Date;
}

export interface CreatedSession {
  /** Return this token once to the caller responsible for setting a secure cookie. */
  token: string;
  session: AuthSession;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSessionTokenFormatValid(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function createSessionService(
  repository: SessionRepository,
  options: SessionServiceOptions,
) {
  const { sessionLifetimeSeconds } = options;
  const now = options.now ?? (() => new Date());

  if (
    !Number.isSafeInteger(sessionLifetimeSeconds) ||
    sessionLifetimeSeconds <= 0
  ) {
    throw new RangeError("Session lifetime must be a positive integer.");
  }

  return {
    async createSession(userId: string): Promise<CreatedSession> {
      const token = randomBytes(32).toString("base64url");
      const sessionTokenHash = hashSessionToken(token);
      const expiresAt = new Date(
        now().getTime() + sessionLifetimeSeconds * 1000,
      );

      const session = await repository.createSession({
        userId,
        sessionTokenHash,
        expiresAt,
      });

      return { token, session };
    },

    /**
     * Validates a token and records activity using the repository's
     * atomic active-and-unexpired update.
     */
    async validateSession(token: string): Promise<AuthSession | null> {
      if (!isSessionTokenFormatValid(token)) {
        return null;
      }

      return repository.touchActiveSession(hashSessionToken(token));
    },

    async revokeSession(token: string): Promise<boolean> {
      if (!isSessionTokenFormatValid(token)) {
        return false;
      }

      return repository.revokeSessionByTokenHash(hashSessionToken(token));
    },

    async revokeAllSessionsForUser(userId: string): Promise<number> {
      return repository.revokeAllSessionsForUser(userId);
    },
  };
}
