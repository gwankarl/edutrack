import type { FastifyError, FastifyInstance } from "fastify";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Request failed");

    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400
        ? error.statusCode
        : 500;

    const message = statusCode >= 500 ? "Internal server error" : error.message;

    void reply.status(statusCode).send({
      error: {
        statusCode,
        message,
      },
    });
  });
}
