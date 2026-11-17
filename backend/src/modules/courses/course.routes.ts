import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherCourseRequestSchema,
  teacherCourseListQuerySchema,
  teacherCourseListResponseSchema,
  teacherCourseParamsSchema,
  teacherCourseResponseSchema,
  updateTeacherCourseRequestSchema,
  teacherDashboardSummaryResponseSchema,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createAcademicCatalogRepository } from "../academic-catalog/academic-catalog.repository.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createTeacherProfileRepository } from "../teachers/teacher-profile.repository.js";
import { createCourseRepository } from "./course.repository.js";
import {
  CourseCatalogReferenceNotFoundError,
  CourseServiceValidationError,
  createCourseService,
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";

type CourseManagementService = Pick<
  ReturnType<typeof createCourseService>,
  | "createCourse"
  | "listMyCourses"
  | "getMyCourse"
  | "updateMyCourse"
  | "getMyDashboardSummary"
>;

export interface CourseRouteServices {
  authenticate: preHandlerHookHandler;
  courses: CourseManagementService;
}

export interface CourseRouteOptions {
  environment: Environment;
  services?: CourseRouteServices;
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
  detail: string,
) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:validation-error",
    title: "Invalid request",
    status: 400,
    detail,
    errors: issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function parseOrSendValidation<T>(
  schema: z.ZodType<T>,
  input: unknown,
  reply: FastifyReply,
  detail: string,
): T | null {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationProblem(reply, error.issues, detail);
      return null;
    }

    throw error;
  }
}

function handleCourseError(error: unknown, reply: FastifyReply) {
  if (error instanceof CourseServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The course request is invalid.",
    );
  }

  if (error instanceof TeacherNotEligibleError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:teacher-role-required",
      title: "Teacher access required",
      status: 403,
      detail: "An approved Teacher account is required.",
    });
  }

  if (error instanceof CourseCatalogReferenceNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:invalid-course-reference",
      title: "Invalid course reference",
      status: 400,
      detail: `The selected ${error.reference} is unavailable.`,
    });
  }

  if (error instanceof TeacherCourseNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-found",
      title: "Course not found",
      status: 404,
      detail: "The requested course was not found.",
    });
  }

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Only draft courses can be updated.",
    });
  }

  throw error;
}

function sendAuthenticationRequired(reply: FastifyReply) {
  return sendProblem(reply, {
    type: "urn:edutrack:problem:authentication-required",
    title: "Authentication required",
    status: 401,
    detail: "A valid session is required.",
  });
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
): CourseRouteServices {
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
    courses: createCourseService({
      courseRepository: createCourseRepository(app.db),
      teacherProfileRepository: createTeacherProfileRepository(app.db),
      identityRepository,
      catalogRepository: createAcademicCatalogRepository(app.db),
    }),
  };
}

export const courseRoutes: FastifyPluginAsync<CourseRouteOptions> = async (
  app,
  { environment, services: injectedServices },
) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const teacherGuard = requireRole("teacher");
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );
  const authenticatedTeacher = [services.authenticate, teacherGuard];

  app.post(
    "/teacher/courses",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const input = parseOrSendValidation(
        createTeacherCourseRequestSchema,
        request.body,
        reply,
        "The course request body is invalid.",
      );

      if (!input) {
        return;
      }

      try {
        const course = await services.courses.createCourse(userId, input);

        return reply.code(201).send(teacherCourseResponseSchema.parse(course));
      } catch (error) {
        return handleCourseError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const filters = parseOrSendValidation(
        teacherCourseListQuerySchema,
        request.query,
        reply,
        "The course-list query is invalid.",
      );

      if (!filters) {
        return;
      }

      try {
        const result = await services.courses.listMyCourses(userId, filters);

        return reply
          .code(200)
          .send(teacherCourseListResponseSchema.parse(result));
      } catch (error) {
        return handleCourseError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseParamsSchema,
        request.params,
        reply,
        "The course route parameters are invalid.",
      );

      if (!params) {
        return;
      }

      try {
        const course = await services.courses.getMyCourse(
          userId,
          params.courseId,
        );

        return reply.code(200).send(teacherCourseResponseSchema.parse(course));
      } catch (error) {
        return handleCourseError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/dashboard/summary",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      try {
        const summary = await services.courses.getMyDashboardSummary(userId);

        return reply
          .code(200)
          .send(teacherDashboardSummaryResponseSchema.parse(summary));
      } catch (error) {
        return handleCourseError(error, reply);
      }
    },
  );
  app.patch(
    "/teacher/courses/:courseId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseParamsSchema,
        request.params,
        reply,
        "The course route parameters are invalid.",
      );

      if (!params) {
        return;
      }

      const input = parseOrSendValidation(
        updateTeacherCourseRequestSchema,
        request.body,
        reply,
        "The course update body is invalid.",
      );

      if (!input) {
        return;
      }

      try {
        const course = await services.courses.updateMyCourse(
          userId,
          params.courseId,
          input,
        );

        return reply.code(200).send(teacherCourseResponseSchema.parse(course));
      } catch (error) {
        return handleCourseError(error, reply);
      }
    },
  );
};
