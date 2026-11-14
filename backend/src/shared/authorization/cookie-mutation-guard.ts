import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

function sendProblem(
  reply: FastifyReply,
  status: number,
  type: string,
  title: string,
  detail: string,
) {
  return reply.code(status).type("application/problem+json").send({
    type,
    title,
    status,
    detail,
  });
}

/**
 * Verifies same-origin cookie mutations and optionally requires JSON requests.
 */
export function createCookieMutationGuard(
  frontendOrigin: string,
  requireJson: boolean,
): preHandlerHookHandler {
  return async function cookieMutationGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const origin = request.headers.origin;
    const fetchSite = request.headers["sec-fetch-site"];
    let originIsAllowed = false;

    if (origin !== undefined) {
      try {
        originIsAllowed = new URL(origin).origin === frontendOrigin;
      } catch {
        originIsAllowed = false;
      }
    }

    if (!originIsAllowed || fetchSite === "cross-site") {
      sendProblem(
        reply,
        403,
        "urn:edutrack:problem:csrf-rejected",
        "Request rejected",
        "The request origin is not allowed.",
      );
      return;
    }

    if (requireJson) {
      const contentType = request.headers["content-type"]
        ?.split(";")[0]
        ?.trim()
        .toLowerCase();

      if (contentType !== "application/json") {
        sendProblem(
          reply,
          415,
          "urn:edutrack:problem:unsupported-media-type",
          "Unsupported media type",
          "Requests must use application/json.",
        );
      }
    }
  };
}
