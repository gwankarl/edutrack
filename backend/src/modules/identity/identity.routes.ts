import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type {
  FastifyPluginAsync,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import type { Environment } from "../../infrastructure/config/env.js";
import {
  createEmailService,
  EmailConfigurationError,
  type EmailService,
  type EmailTransportFactory,
} from "../../infrastructure/email/email.service.js";
import {
  createIdentityRepository,
  DuplicateEmailError,
} from "./identity.repository.js";
import { createIdentityService } from "./identity.service.js";
import { hashPassword } from "./password.service.js";
import {
  createEmailVerificationService,
  EmailVerificationDeliveryError,
} from "./email-verification.service.js";
import { createPasswordRecoveryService } from "./password-recovery.service.js";
import { createVerificationTokenRepository } from "./verification-token.repository.js";
import {
  createVerificationTokenService,
  InvalidVerificationTokenError,
} from "./verification-token.service.js";
import {
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from "./identity.schemas.js";

type RegistrationService = Pick<
  ReturnType<typeof createIdentityService>,
  "register"
>;
type EmailVerificationService = Pick<
  ReturnType<typeof createEmailVerificationService>,
  "verifyEmail"
>;
type PasswordRecoveryService = Pick<
  ReturnType<typeof createPasswordRecoveryService>,
  "requestReset" | "resetPassword"
>;

export interface IdentityRouteServices {
  registration: RegistrationService;
  emailVerification: EmailVerificationService;
  passwordRecovery: PasswordRecoveryService;
}

export interface IdentityRouteOptions {
  environment: Environment;
  emailTransportFactory?: EmailTransportFactory;
  /** Service overrides keep route unit tests independent of PostgreSQL and SMTP. */
  services?: IdentityRouteServices;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: Array<{ field: string; message: string }>;
}

function sendProblem(reply: FastifyReply, problem: ProblemDetails) {
  return reply
    .code(problem.status)
    .type("application/problem+json")
    .send(problem);
}

function sendValidationProblem(reply: FastifyReply, error: ZodError) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:validation-error",
    title: "Invalid registration request",
    status: 400,
    detail: "The registration request is invalid.",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function sendDuplicateEmailProblem(reply: FastifyReply) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:registration-conflict",
    title: "Registration conflict",
    status: 409,
    detail: "Registration could not be completed.",
  });
}

function handleIdentityRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return sendValidationProblem(reply, error);
  }

  if (error instanceof InvalidVerificationTokenError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:invalid-token",
      title: "Invalid or expired token",
      status: 400,
      detail: "The token is invalid, expired, or already used.",
    });
  }

  if (error instanceof DuplicateEmailError) {
    return sendDuplicateEmailProblem(reply);
  }

  if (error instanceof EmailVerificationDeliveryError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:email-delivery-unavailable",
      title: "Registration email unavailable",
      status: 503,
      detail:
        "Your account was created, but the verification email could not be sent.",
    });
  }

  throw error;
}

function publicMutationGuard(frontendOrigin: string) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> => {
    const origin = request.headers.origin;
    const fetchSite = request.headers["sec-fetch-site"];
    const contentType = request.headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    let originIsAllowed = true;
    if (origin !== undefined) {
      try {
        originIsAllowed = new URL(origin).origin === frontendOrigin;
      } catch {
        originIsAllowed = false;
      }
    }

    if (!originIsAllowed || fetchSite === "cross-site") {
      return sendProblem(reply, {
        type: "urn:edutrack:problem:csrf-rejected",
        title: "Request rejected",
        status: 403,
        detail: "The request origin is not allowed.",
      });
    }

    if (contentType !== "application/json") {
      return sendProblem(reply, {
        type: "urn:edutrack:problem:unsupported-media-type",
        title: "Unsupported media type",
        status: 415,
        detail: "Requests must use application/json.",
      });
    }
  };
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
  emailTransportFactory?: EmailTransportFactory,
): IdentityRouteServices {
  const repository = createIdentityRepository(app.db);
  const tokenRepository = createVerificationTokenRepository(app.db);
  const tokenService = createVerificationTokenService(tokenRepository);
  let emailService: EmailService;

  if (environment.SMTP_HOST === undefined) {
    emailService = {
      async send() {
        throw new EmailConfigurationError();
      },
    };
  } else {
    emailService = createEmailService(environment, emailTransportFactory);
  }

  const emailVerificationService = createEmailVerificationService({
    tokenService,
    emailService,
    frontendUrl: environment.FRONTEND_URL,
  });

  return {
    registration: createIdentityService({
      repository,
      hashPassword,
      emailVerificationService,
    }),
    emailVerification: emailVerificationService,
    passwordRecovery: createPasswordRecoveryService({
      identityRepository: repository,
      tokenService,
      emailService,
      frontendUrl: environment.FRONTEND_URL,
      hashPassword,
    }),
  };
}

export const identityRoutes: FastifyPluginAsync<IdentityRouteOptions> = async (
  app,
  { environment, emailTransportFactory, services: injectedServices },
) => {
  await app.register(rateLimit, {
    global: false,
    max: 30,
    timeWindow: "1 minute",
  });

  const services =
    injectedServices ??
    createRouteServices(app, environment, emailTransportFactory);
  const frontendOrigin = new URL(environment.FRONTEND_URL).origin;
  const guard = publicMutationGuard(frontendOrigin);

  app.post("/auth/register", async (request, reply) => {
    try {
      const user = await services.registration.register(request.body);
      return reply.code(201).send(user);
    } catch (error) {
      return handleIdentityRouteError(error, reply);
    }
  });

  app.post(
    "/auth/verify-email",
    {
      preHandler: guard,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      try {
        const body = verifyEmailRequestSchema.parse(request.body);
        await services.emailVerification.verifyEmail(body.token);

        return reply
          .code(200)
          .send(
            verifyEmailResponseSchema.parse({ message: "Email verified." }),
          );
      } catch (error) {
        return handleIdentityRouteError(error, reply);
      }
    },
  );

  app.post(
    "/auth/forgot-password",
    {
      preHandler: guard,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      try {
        const body = forgotPasswordRequestSchema.parse(request.body);
        const response = await services.passwordRecovery.requestReset(
          body.email,
        );

        return reply
          .code(202)
          .send(forgotPasswordResponseSchema.parse(response));
      } catch (error) {
        return handleIdentityRouteError(error, reply);
      }
    },
  );

  app.post(
    "/auth/reset-password",
    {
      preHandler: guard,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      try {
        const body = resetPasswordRequestSchema.parse(request.body);
        const response = await services.passwordRecovery.resetPassword(
          body.token,
          body.newPassword,
        );

        return reply
          .code(200)
          .send(resetPasswordResponseSchema.parse(response));
      } catch (error) {
        return handleIdentityRouteError(error, reply);
      }
    },
  );
};
