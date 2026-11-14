import { randomBytes } from "node:crypto";

import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginResponse,
} from "./identity.schemas.js";
import type { IdentityLoginUser } from "./identity.repository.js";
import type { CreatedSession } from "./session.service.js";

export interface LoginIdentityRepository {
  findUserForLogin(email: string): Promise<IdentityLoginUser | null>;
}

export interface LoginSessionService {
  createSession(userId: string): Promise<CreatedSession>;
}

export interface LoginServiceDependencies {
  identityRepository: LoginIdentityRepository;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
  sessionService: LoginSessionService;
}

export interface LoginResult {
  user: LoginResponse;
  /** Internal service result for later secure-cookie handling; never send in JSON. */
  sessionToken: string;
  sessionExpiresAt: Date;
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export class LoginSessionCreationError extends Error {
  constructor() {
    super("Login could not be completed.");
    this.name = "LoginSessionCreationError";
  }
}

export function createLoginService({
  identityRepository,
  verifyPassword,
  hashPassword,
  sessionService,
}: LoginServiceDependencies) {
  // Generate one valid dummy hash during service setup. Unknown users still
  // incur an Argon2 verification so the code path is closer to a real account.
  const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64url"));

  return {
    async login(input: unknown): Promise<LoginResult> {
      const request = loginRequestSchema.parse(input);
      const user = await identityRepository.findUserForLogin(request.email);
      const passwordHash = user?.passwordHash ?? (await dummyPasswordHash);

      const passwordMatches = await verifyPassword(
        request.password,
        passwordHash,
      );

      if (
        !user ||
        !passwordMatches ||
        user.accountStatus !== "active" ||
        user.emailVerifiedAt === null
      ) {
        throw new InvalidCredentialsError();
      }

      let createdSession: CreatedSession;
      try {
        createdSession = await sessionService.createSession(user.id);
      } catch {
        // Do not expose database errors or attach them as a cause.
        throw new LoginSessionCreationError();
      }

      const safeUser = loginResponseSchema.parse({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });

      return {
        user: safeUser,
        sessionToken: createdSession.token,
        sessionExpiresAt: createdSession.session.expiresAt,
      };
    },
  };
}
