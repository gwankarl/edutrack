import type { FastifyError, FastifyInstance } from "fastify";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Request failed");

    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400
        ? error.statusCode
        : 500;

    const isRateLimited = statusCode === 429;
    const isServerError = statusCode >= 500;

    void reply
      .status(statusCode)
      .type("application/problem+json")
      .send({
        type: isRateLimited
          ? "urn:edutrack:problem:rate-limit-exceeded"
          : isServerError
            ? "urn:edutrack:problem:internal-error"
            : "urn:edutrack:problem:request-error",
        title: isRateLimited
          ? "Too many requests"
          : isServerError
            ? "Internal server error"
            : "Request could not be completed",
        status: statusCode,
        detail: isRateLimited
          ? "Too many requests. Please try again later."
          : isServerError
            ? "An unexpected error occurred."
            : "The request could not be completed.",
      });
  });
}
