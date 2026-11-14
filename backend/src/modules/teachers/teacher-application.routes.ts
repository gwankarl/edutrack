import { ZodError } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  getMyTeacherApplicationResponseSchema,
  submitTeacherApplicationRequestSchema,
  teacherApplicationResponseSchema,
  type SubmitTeacherApplicationRequest,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import {
  PendingTeacherApplicationExistsError,
  createTeacherApplicationRepository,
} from "./teacher-application.repository.js";
import {
  createTeacherApplicationService,
  TeacherApplicationAlreadyApprovedError,
  TeacherApplicationNotEligibleError,
  TeacherRoleAlreadyAssignedError,
} from "./teacher-application.service.js";

type TeacherApplicationService = Pick<
  ReturnType<typeof createTeacherApplicationService>,
  "submitApplication" | "getMyApplication"
>;

export interface TeacherApplicationRouteServices {
  authenticate: preHandlerHookHandler;
  teacherApplications: TeacherApplicationService;
}

export interface TeacherApplicationRouteOptions {
  environment: Environment;
  services?: TeacherApplicationRouteServices;
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
    detail: "The request body is invalid.",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function handleTeacherApplicationError(error: unknown, reply: FastifyReply) {
  if (error instanceof TeacherApplicationNotEligibleError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-application-ineligible",
      title: "Application unavailable",
      status: 403,
      detail: "This account is not eligible to submit a teacher application.",
    });
  }

  if (error instanceof PendingTeacherApplicationExistsError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-application-pending",
      title: "Application already pending",
      status: 409,
      detail: "A pending teacher application already exists.",
    });
  }

  if (error instanceof TeacherApplicationAlreadyApprovedError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-application-approved",
      title: "Application already approved",
      status: 409,
      detail: "An approved teacher application already exists.",
    });
  }

  if (error instanceof TeacherRoleAlreadyAssignedError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-role-already-assigned",
      title: "Teacher role already assigned",
      status: 409,
      detail: "This account already has the Teacher role.",
    });
  }

  throw error;
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
): TeacherApplicationRouteServices {
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
    teacherApplications: createTeacherApplicationService({
      repository: createTeacherApplicationRepository(app.db),
      identityRepository,
    }),
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

export const teacherApplicationRoutes: FastifyPluginAsync<
  TeacherApplicationRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );

  app.post(
    "/teacher-applications",
    { preHandler: [mutationGuard, services.authenticate] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      let input: SubmitTeacherApplicationRequest;

      try {
        input = submitTeacherApplicationRequestSchema.parse(request.body);
      } catch (error) {
        if (error instanceof ZodError) {
          return sendValidationProblem(reply, error);
        }

        throw error;
      }

      try {
        const application =
          await services.teacherApplications.submitApplication(userId, input);

        return reply
          .code(201)
          .send(teacherApplicationResponseSchema.parse(application));
      } catch (error) {
        return handleTeacherApplicationError(error, reply);
      }
    },
  );

  app.get(
    "/teacher-applications/me",
    { preHandler: services.authenticate },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      try {
        const application =
          await services.teacherApplications.getMyApplication(userId);

        return reply
          .code(200)
          .send(getMyTeacherApplicationResponseSchema.parse(application));
      } catch (error) {
        return handleTeacherApplicationError(error, reply);
      }
    },
  );
};
