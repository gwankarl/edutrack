import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { AuthContext } from "./auth-context.js";

export interface ResourceAccessPolicy<Resource> {
  /**
   * Resolve the resource using trusted backend data and request identifiers.
   * Return null when no such resource exists.
   */
  resolveResource: (request: FastifyRequest) => Promise<Resource | null>;

  /** Return the owner ID from the resolved backend resource. */
  getOwnerId: (resource: Resource) => string | null;

  /**
   * Check an explicitly granted permission using trusted backend data.
   * Do not use permission or owner information supplied by the client.
   */
  hasPermission?: (
    resource: Resource,
    authContext: AuthContext,
  ) => boolean | Promise<boolean>;

  /** Administrators are not granted access unless the resource policy opts in. */
  allowAdministrator?: boolean;

  /** Return 404 instead of 403 when a denied resource's existence is concealed. */
  concealExistence?: boolean;
}

function sendProblem(reply: FastifyReply, status: 401 | 403 | 404) {
  const problems = {
    401: {
      type: "urn:edutrack:problem:authentication-required",
      title: "Authentication required",
      detail: "A valid session is required.",
    },
    403: {
      type: "urn:edutrack:problem:forbidden",
      title: "Forbidden",
      detail: "You do not have permission to access this resource.",
    },
    404: {
      type: "urn:edutrack:problem:not-found",
      title: "Not found",
      detail: "The requested resource was not found.",
    },
  } as const;

  return reply
    .code(status)
    .type("application/problem+json")
    .send({
      ...problems[status],
      status,
    });
}

/**
 * Creates an opt-in resource guard. The domain supplies trusted resource
 * lookup and permission checks; this function applies common access rules.
 */
export function requireResourceAccess<Resource>(
  policy: ResourceAccessPolicy<Resource>,
): preHandlerHookHandler {
  return async function authorizeResourceAccess(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authContext = request.authContext;

    if (!authContext) {
      sendProblem(reply, 401);
      return;
    }

    const resource = await policy.resolveResource(request);

    if (!resource) {
      sendProblem(reply, 404);
      return;
    }

    const isOwner = policy.getOwnerId(resource) === authContext.userId;
    const hasPermission = policy.hasPermission
      ? await policy.hasPermission(resource, authContext)
      : false;
    const isAllowedAdministrator =
      policy.allowAdministrator === true &&
      authContext.roles.includes("administrator");

    if (isOwner || hasPermission || isAllowedAdministrator) {
      return;
    }

    sendProblem(reply, policy.concealExistence ? 404 : 403);
  };
}
