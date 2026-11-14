import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";

function sendUnauthenticated(reply: FastifyReply) {
  return reply.code(401).type("application/problem+json").send({
    type: "urn:edutrack:problem:authentication-required",
    title: "Authentication required",
    status: 401,
    detail: "A valid session is required.",
  });
}

function sendForbidden(reply: FastifyReply) {
  return reply.code(403).type("application/problem+json").send({
    type: "urn:edutrack:problem:forbidden",
    title: "Forbidden",
    status: 403,
    detail: "You do not have permission to access this resource.",
  });
}

/**
 * Allows a request when its server-loaded authentication context has
 * at least one of the required roles.
 */
export function requireRole(
  ...requiredRoles: UserRole[]
): preHandlerHookHandler {
  if (requiredRoles.length === 0) {
    throw new RangeError("requireRole needs at least one role.");
  }

  return async function authorizeRole(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authContext = request.authContext;

    if (!authContext) {
      sendUnauthenticated(reply);
      return;
    }

    const hasRequiredRole = requiredRoles.some((role) =>
      authContext.roles.includes(role),
    );

    if (!hasRequiredRole) {
      sendForbidden(reply);
    }
  };
}
