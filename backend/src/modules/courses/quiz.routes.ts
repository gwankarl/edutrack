import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherQuizRequestSchema,
  reorderTeacherQuizzesRequestSchema,
  teacherQuizListResponseSchema,
  teacherQuizResponseSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
  updateTeacherQuizRequestSchema,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createTeacherProfileRepository } from "../teachers/teacher-profile.repository.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";
import { createCourseRepository } from "./course.repository.js";
import {
  createQuizService,
  QuizPositionConflictError,
  QuizOrderValidationError,
  QuizServiceValidationError,
  TeacherQuizNotFoundError,
} from "./quiz.service.js";
import { createQuizRepository } from "./quiz.repository.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";
import { createTopicRepository } from "./topic.repository.js";

type QuizManagementService = Pick<
  ReturnType<typeof createQuizService>,
  | "createQuiz"
  | "listTopicQuizzes"
  | "getQuiz"
  | "updateQuiz"
  | "reorderQuizzes"
>;

export interface QuizRouteServices {
  authenticate: preHandlerHookHandler;
  quizzes: QuizManagementService;
}

export interface QuizRouteOptions {
  environment: Environment;
  services?: QuizRouteServices;
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

function handleQuizError(error: unknown, reply: FastifyReply) {
  if (error instanceof QuizServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The quiz request is invalid.",
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

  if (error instanceof TeacherQuizNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-not-found",
      title: "Quiz not found",
      status: 404,
      detail: "The requested quiz was not found.",
    });
  }

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Quizzes can only be changed while the course is a draft.",
    });
  }

  if (error instanceof QuizPositionConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-position-conflict",
      title: "Quiz position conflict",
      status: 409,
      detail: "Quiz ordering could not be saved. Please retry the request.",
    });
  }

  if (error instanceof QuizOrderValidationError) {
    return sendValidationProblem(
      reply,
      [{ code: "custom", path: ["quizIds"], message: error.message }],
      "The quiz order must contain every quiz in this topic exactly once.",
    );
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
): QuizRouteServices {
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
    quizzes: createQuizService({
      quizRepository: createQuizRepository(app.db),
      courseRepository: createCourseRepository(app.db),
      topicRepository: createTopicRepository(app.db),
      teacherProfileRepository: createTeacherProfileRepository(app.db),
      identityRepository,
    }),
  };
}

export const quizRoutes: FastifyPluginAsync<QuizRouteOptions> = async (
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
    "/teacher/courses/:courseId/topics/:topicId/quizzes/order",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);
      const params = parseOrSendValidation(
        teacherTopicQuizCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;
      const input = parseOrSendValidation(
        reorderTeacherQuizzesRequestSchema,
        request.body,
        reply,
        "The quiz order request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.quizzes.reorderQuizzes(
          userId,
          params.courseId,
          params.topicId,
          input,
        );
        return reply
          .code(200)
          .send(teacherQuizListResponseSchema.parse(result));
      } catch (error) {
        return handleQuizError(error, reply);
      }
    },
  );

  app.post(
    "/teacher/courses/:courseId/topics/:topicId/quizzes",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherTopicQuizCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        createTeacherQuizRequestSchema,
        request.body,
        reply,
        "The quiz request body is invalid.",
      );
      if (!input) return;

      try {
        const quiz = await services.quizzes.createQuiz(
          userId,
          params.courseId,
          params.topicId,
          input,
        );
        return reply.code(201).send(teacherQuizResponseSchema.parse(quiz));
      } catch (error) {
        return handleQuizError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics/:topicId/quizzes",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherTopicQuizCollectionParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      try {
        const result = await services.quizzes.listTopicQuizzes(
          userId,
          params.courseId,
          params.topicId,
        );
        return reply
          .code(200)
          .send(teacherQuizListResponseSchema.parse(result));
      } catch (error) {
        return handleQuizError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics/:topicId/quizzes/:quizId",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherTopicQuizParamsSchema,
        request.params,
        reply,
        "The course, topic, or quiz route parameters are invalid.",
      );
      if (!params) return;

      try {
        const quiz = await services.quizzes.getQuiz(
          userId,
          params.courseId,
          params.topicId,
          params.quizId,
        );
        return reply.code(200).send(teacherQuizResponseSchema.parse(quiz));
      } catch (error) {
        return handleQuizError(error, reply);
      }
    },
  );

  app.patch(
    "/teacher/courses/:courseId/topics/:topicId/quizzes/:quizId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherTopicQuizParamsSchema,
        request.params,
        reply,
        "The course, topic, or quiz route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        updateTeacherQuizRequestSchema,
        request.body,
        reply,
        "The quiz update body is invalid.",
      );
      if (!input) return;

      try {
        const quiz = await services.quizzes.updateQuiz(
          userId,
          params.courseId,
          params.topicId,
          params.quizId,
          input,
        );
        return reply.code(200).send(teacherQuizResponseSchema.parse(quiz));
      } catch (error) {
        return handleQuizError(error, reply);
      }
    },
  );
};
