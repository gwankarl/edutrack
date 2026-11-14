import { ZodError } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  adminTeacherApplicationDecisionParamsSchema,
  adminTeacherApplicationDecisionResponseSchema,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createTeacherApplicationDecisionRepository } from "./teacher-application-decision.repository.js";
import {
  createTeacherApplicationDecisionService,
  TeacherApplicationDecisionConflictError,
  TeacherApplicationDecisionNotFoundError,
  TeacherApplicationDecisionValidationError,
} from "./teacher-application-decision.service.js";

type DecisionService = Pick<
  ReturnType<typeof createTeacherApplicationDecisionService>,
  "approveApplication" | "rejectApplication"
>;

export interface TeacherApplicationDecisionRouteServices {
  authenticate: preHandlerHookHandler;
  decisions: DecisionService;
}

export interface TeacherApplicationDecisionRouteOptions {
  environment: Environment;
  services?: TeacherApplicationDecisionRouteServices;
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

function sendValidationProblem(
  reply: FastifyReply,
  issues: ZodError["issues"],
) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:validation-error",
    title: "Invalid request",
    status: 400,
    detail: "The application ID or decision details are invalid.",
    errors: issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function handleDecisionError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return sendValidationProblem(reply, error.issues);
  }

  if (error instanceof TeacherApplicationDecisionValidationError) {
    return sendValidationProblem(reply, error.issues);
  }

  if (error instanceof TeacherApplicationDecisionNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-application-not-found",
      title: "Teacher application not found",
      status: 404,
      detail: "The requested teacher application was not found.",
    });
  }

  if (error instanceof TeacherApplicationDecisionConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-application-decision-conflict",
      title: "Application already reviewed",
      status: 409,
      detail: "The teacher application is no longer pending.",
    });
  }

  throw error;
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
): TeacherApplicationDecisionRouteServices {
  const identityRepository = createIdentityRepository(app.db);
  const sessionService = createSessionService(createSessionRepository(app.db), {
    sessionLifetimeSeconds: environment.SESSION_TTL_SECONDS,
  });

  const decisions = createTeacherApplicationDecisionService({
    withTransaction: (operation) =>
      app.db.transaction((transaction) =>
        operation(createTeacherApplicationDecisionRepository(transaction)),
      ),
  });

  return {
    authenticate: createAuthenticate({
      environment,
      sessionService,
      identityRepository,
    }),
    decisions,
  };
}

function sendAuthenticationRequired(reply: FastifyReply) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:authentication-required",
    title: "Authentication required",
    status: 401,
    detail: "A valid session is required.",
  });
}

export const teacherApplicationDecisionRoutes: FastifyPluginAsync<
  TeacherApplicationDecisionRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );
  const administratorGuard = requireRole("administrator");

  app.post(
    "/admin/teacher-applications/:applicationId/approve",
    {
      preHandler: [mutationGuard, services.authenticate, administratorGuard],
    },
    async (request, reply) => {
      let params;
      let body;

      try {
        params = adminTeacherApplicationDecisionParamsSchema.parse(
          request.params,
        );
        body = approveTeacherApplicationRequestSchema.parse(request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return sendValidationProblem(reply, error.issues);
        }

        throw error;
      }

      const administratorId = request.authContext?.userId;

      if (!administratorId) {
        return sendAuthenticationRequired(reply);
      }

      let result;

      try {
        result = await services.decisions.approveApplication(
          params.applicationId,
          administratorId,
          body,
        );
      } catch (error) {
        return handleDecisionError(error, reply);
      }

      return reply
        .code(200)
        .send(adminTeacherApplicationDecisionResponseSchema.parse(result));
    },
  );

  app.post(
    "/admin/teacher-applications/:applicationId/reject",
    {
      preHandler: [mutationGuard, services.authenticate, administratorGuard],
    },
    async (request, reply) => {
      let params;
      let body;

      try {
        params = adminTeacherApplicationDecisionParamsSchema.parse(
          request.params,
        );
        body = rejectTeacherApplicationRequestSchema.parse(request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return sendValidationProblem(reply, error.issues);
        }

        throw error;
      }

      const administratorId = request.authContext?.userId;

      if (!administratorId) {
        return sendAuthenticationRequired(reply);
      }

      let result;

      try {
        result = await services.decisions.rejectApplication(
          params.applicationId,
          administratorId,
          body,
        );
      } catch (error) {
        return handleDecisionError(error, reply);
      }

      return reply
        .code(200)
        .send(adminTeacherApplicationDecisionResponseSchema.parse(result));
    },
  );
};
