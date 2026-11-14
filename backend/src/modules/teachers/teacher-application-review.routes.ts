import { ZodError } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  adminTeacherApplicationListQuerySchema,
  adminTeacherApplicationListResponseSchema,
  adminTeacherApplicationParamsSchema,
  adminTeacherApplicationResponseSchema,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createTeacherApplicationReviewRepository } from "./teacher-application-review.repository.js";
import {
  createTeacherApplicationReviewService,
  TeacherApplicationNotFoundError,
} from "./teacher-application-review.service.js";

type ReviewService = Pick<
  ReturnType<typeof createTeacherApplicationReviewService>,
  "listApplications" | "getApplicationById"
>;

export interface TeacherApplicationReviewRouteServices {
  authenticate: preHandlerHookHandler;
  review: ReviewService;
}

export interface TeacherApplicationReviewRouteOptions {
  environment: Environment;
  services?: TeacherApplicationReviewRouteServices;
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
    title: "Invalid request",
    status: 400,
    detail: "The query parameters or application ID are invalid.",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
): TeacherApplicationReviewRouteServices {
  const identityRepository = createIdentityRepository(app.db);
  const sessionService = createSessionService(createSessionRepository(app.db), {
    sessionLifetimeSeconds: environment.SESSION_TTL_SECONDS,
  });

  return {
    authenticate: createAuthenticate({
      environment,
      sessionService,
      identityRepository,
    }),
    review: createTeacherApplicationReviewService({
      repository: createTeacherApplicationReviewRepository(app.db),
    }),
  };
}

export const teacherApplicationReviewRoutes: FastifyPluginAsync<
  TeacherApplicationReviewRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const administratorGuard = requireRole("administrator");

  app.get(
    "/admin/teacher-applications",
    { preHandler: [services.authenticate, administratorGuard] },
    async (request, reply) => {
      let query;

      try {
        query = adminTeacherApplicationListQuerySchema.parse(request.query);
      } catch (error) {
        if (error instanceof ZodError) {
          return sendValidationProblem(reply, error);
        }

        throw error;
      }

      const result = await services.review.listApplications(query);

      return reply
        .code(200)
        .send(adminTeacherApplicationListResponseSchema.parse(result));
    },
  );

  app.get(
    "/admin/teacher-applications/:applicationId",
    { preHandler: [services.authenticate, administratorGuard] },
    async (request, reply) => {
      let params;

      try {
        params = adminTeacherApplicationParamsSchema.parse(request.params);
      } catch (error) {
        if (error instanceof ZodError) {
          return sendValidationProblem(reply, error);
        }

        throw error;
      }

      try {
        const result = await services.review.getApplicationById(
          params.applicationId,
        );

        return reply
          .code(200)
          .send(adminTeacherApplicationResponseSchema.parse(result));
      } catch (error) {
        if (error instanceof TeacherApplicationNotFoundError) {
          return sendProblem(reply, {
            type: "urn:edutrack:problem:teacher-application-not-found",
            title: "Teacher application not found",
            status: 404,
            detail: "The requested teacher application was not found.",
          });
        }

        throw error;
      }
    },
  );
};
