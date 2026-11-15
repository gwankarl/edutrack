import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherLessonRequestSchema,
  reorderTeacherLessonsRequestSchema,
  teacherCourseTopicLessonParamsSchema,
  teacherLessonListResponseSchema,
  teacherLessonResponseSchema,
  teacherTopicLessonCollectionParamsSchema,
  updateTeacherLessonRequestSchema,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createTeacherProfileRepository } from "../teachers/teacher-profile.repository.js";
import { createCourseRepository } from "./course.repository.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";
import { createLessonRepository } from "./lesson.repository.js";
import {
  createLessonService,
  LessonPositionConflictError,
  LessonOrderMismatchError,
  LessonReorderConflictError,
  LessonServiceValidationError,
  TeacherLessonNotFoundError,
} from "./lesson.service.js";
import { createTopicRepository } from "./topic.repository.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";

type LessonManagementService = Pick<
  ReturnType<typeof createLessonService>,
  | "createLesson"
  | "listTopicLessons"
  | "getLesson"
  | "updateLesson"
  | "reorderLessons"
>;

export interface LessonRouteServices {
  authenticate: preHandlerHookHandler;
  lessons: LessonManagementService;
}

export interface LessonRouteOptions {
  environment: Environment;
  services?: LessonRouteServices;
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

function handleLessonError(error: unknown, reply: FastifyReply) {
  if (error instanceof LessonServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The lesson request is invalid.",
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

  if (error instanceof TeacherCourseNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-found",
      title: "Course not found",
      status: 404,
      detail: "The requested course was not found.",
    });
  }

  if (error instanceof TeacherTopicNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:topic-not-found",
      title: "Topic not found",
      status: 404,
      detail: "The requested topic was not found.",
    });
  }

  if (error instanceof TeacherLessonNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:lesson-not-found",
      title: "Lesson not found",
      status: 404,
      detail: "The requested lesson was not found.",
    });
  }

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Lessons can only be changed while the course is a draft.",
    });
  }

  if (error instanceof LessonPositionConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:lesson-position-conflict",
      title: "Lesson could not be created",
      status: 409,
      detail: "A lesson position conflict occurred. Please retry the request.",
    });
  }

  if (error instanceof LessonOrderMismatchError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:invalid-lesson-order",
      title: "Invalid lesson order",
      status: 400,
      detail: "Provide every lesson in this topic exactly once.",
    });
  }

  if (error instanceof LessonReorderConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:lesson-order-conflict",
      title: "Lesson order could not be updated",
      status: 409,
      detail: "The lessons changed concurrently. Reload and try again.",
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
): LessonRouteServices {
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
    lessons: createLessonService({
      lessonRepository: createLessonRepository(app.db),
      courseRepository: createCourseRepository(app.db),
      topicRepository: createTopicRepository(app.db),
      teacherProfileRepository: createTeacherProfileRepository(app.db),
      identityRepository,
    }),
  };
}

export const lessonRoutes: FastifyPluginAsync<LessonRouteOptions> = async (
  app,
  { environment, services: injectedServices },
) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const authenticatedTeacher = [services.authenticate, requireRole("teacher")];
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );

  app.put(
    "/teacher/courses/:courseId/topics/:topicId/lessons/order",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherTopicLessonCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        reorderTeacherLessonsRequestSchema,
        request.body,
        reply,
        "The lesson order request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.lessons.reorderLessons(
          userId,
          params.courseId,
          params.topicId,
          input,
        );
        return reply
          .code(200)
          .send(teacherLessonListResponseSchema.parse(result));
      } catch (error) {
        return handleLessonError(error, reply);
      }
    },
  );

  app.post(
    "/teacher/courses/:courseId/topics/:topicId/lessons",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherTopicLessonCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        createTeacherLessonRequestSchema,
        request.body,
        reply,
        "The lesson request body is invalid.",
      );
      if (!input) return;

      try {
        const lesson = await services.lessons.createLesson(
          userId,
          params.courseId,
          params.topicId,
          input,
        );
        return reply.code(201).send(teacherLessonResponseSchema.parse(lesson));
      } catch (error) {
        return handleLessonError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics/:topicId/lessons",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherTopicLessonCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      try {
        const result = await services.lessons.listTopicLessons(
          userId,
          params.courseId,
          params.topicId,
        );
        return reply
          .code(200)
          .send(teacherLessonListResponseSchema.parse(result));
      } catch (error) {
        return handleLessonError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics/:topicId/lessons/:lessonId",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseTopicLessonParamsSchema,
        request.params,
        reply,
        "The course, topic, or lesson route parameters are invalid.",
      );
      if (!params) return;

      try {
        const lesson = await services.lessons.getLesson(
          userId,
          params.courseId,
          params.topicId,
          params.lessonId,
        );
        return reply.code(200).send(teacherLessonResponseSchema.parse(lesson));
      } catch (error) {
        return handleLessonError(error, reply);
      }
    },
  );

  app.patch(
    "/teacher/courses/:courseId/topics/:topicId/lessons/:lessonId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseTopicLessonParamsSchema,
        request.params,
        reply,
        "The course, topic, or lesson route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        updateTeacherLessonRequestSchema,
        request.body,
        reply,
        "The lesson update body is invalid.",
      );
      if (!input) return;

      try {
        const lesson = await services.lessons.updateLesson(
          userId,
          params.courseId,
          params.topicId,
          params.lessonId,
          input,
        );
        return reply.code(200).send(teacherLessonResponseSchema.parse(lesson));
      } catch (error) {
        return handleLessonError(error, reply);
      }
    },
  );
};
