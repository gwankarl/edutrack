import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { Environment } from "../../infrastructure/config/env.js";
import { getSessionCookieName } from "../../infrastructure/sessions/session-cookie.js";
import type { createIdentityRepository } from "../../modules/identity/identity.repository.js";
import type { createSessionService } from "../../modules/identity/session.service.js";
import type { AuthContext } from "./auth-context.js";

type SessionValidator = Pick<
  ReturnType<typeof createSessionService>,
  "validateSession" | "revokeSession"
>;

type IdentityLookup = Pick<
  ReturnType<typeof createIdentityRepository>,
  "findUserById" | "findRolesByUserId"
>;

export interface AuthenticateDependencies {
  environment: Pick<Environment, "NODE_ENV">;
  sessionService: SessionValidator;
  identityRepository: IdentityLookup;
}

function sendAuthenticationRequired(reply: FastifyReply) {
  return reply.code(401).type("application/problem+json").send({
    type: "urn:edutrack:problem:authentication-required",
    title: "Authentication required",
    status: 401,
    detail: "A valid session is required.",
  });
}

/**
 * Creates an opt-in Fastify pre-handler for routes requiring an active user.
 * Public routes remain accessible by not registering this pre-handler on them.
 */
export function createAuthenticate({
  environment,
  sessionService,
  identityRepository,
}: AuthenticateDependencies): preHandlerHookHandler {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const cookieName = getSessionCookieName(environment);
    const sessionToken = request.cookies[cookieName];

    if (!sessionToken) {
      sendAuthenticationRequired(reply);
      return;
    }

    const session = await sessionService.validateSession(sessionToken);

    if (!session) {
      sendAuthenticationRequired(reply);
      return;
    }

    const user = await identityRepository.findUserById(session.userId);

    if (!user || user.accountStatus !== "active") {
      // Stop a disabled account from reusing this session.
      await sessionService.revokeSession(sessionToken);
      sendAuthenticationRequired(reply);
      return;
    }

    const roles = await identityRepository.findRolesByUserId(user.id);

    const authContext: AuthContext = {
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      roles,
    };

    request.authContext = authContext;
  };
}
