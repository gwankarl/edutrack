import type { FastifyServerOptions } from "fastify";

import type { Environment } from "../config/env.js";

export function createLoggerOptions(
  environment: Environment,
): FastifyServerOptions["logger"] {
  return {
    level: environment.NODE_ENV === "test" ? "silent" : "info",

    ...(environment.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: true,
        },
      },
    }),

    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      censor: "[REDACTED]",
    },
  };
}
