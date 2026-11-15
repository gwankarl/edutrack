import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherQuizQuestionRequestSchema,
  reorderTeacherQuizQuestionsRequestSchema,
  teacherQuizQuestionCollectionParamsSchema,
  teacherQuizQuestionListResponseSchema,
  teacherQuizQuestionParamsSchema,
  teacherQuizQuestionResponseSchema,
  updateTeacherQuizQuestionRequestSchema,
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
  TeacherNotEligibleError,
} from "./course.service.js";
import { createQuizQuestionRepository } from "./quiz-question.repository.js";
import {
  createQuizQuestionService,
  QuizQuestionPositionConflictError,
  QuizQuestionOrderValidationError,
  QuizQuestionServiceValidationError,
  TeacherQuizQuestionNotFoundError,
} from "./quiz-question.service.js";
import { TeacherQuizNotFoundError } from "./quiz.service.js";

type QuestionOperations = Pick<
  ReturnType<typeof createQuizQuestionService>,
  | "createQuestion"
  | "listQuestions"
  | "getQuestion"
  | "updateQuestion"
  | "reorderQuestions"
>;

export interface QuizQuestionRouteServices {
  authenticate: preHandlerHookHandler;
  questions: QuestionOperations;
}

export interface QuizQuestionRouteOptions {
  environment: Environment;
  services?: QuizQuestionRouteServices;
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

function handleQuestionError(error: unknown, reply: FastifyReply) {
  if (error instanceof QuizQuestionServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The question request is invalid.",
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

  if (error instanceof TeacherQuizNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-not-found",
      title: "Quiz not found",
      status: 404,
      detail: "The requested quiz was not found.",
    });
  }

  if (error instanceof TeacherQuizQuestionNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-question-not-found",
      title: "Question not found",
      status: 404,
      detail: "The requested question was not found.",
    });
  }

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Questions can only be changed while the course is a draft.",
    });
  }

  if (error instanceof QuizQuestionPositionConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-question-position-conflict",
      title: "Question position conflict",
      status: 409,
      detail: "Question ordering could not be saved. Please retry.",
    });
  }

  if (error instanceof QuizQuestionOrderValidationError) {
    return sendValidationProblem(
      reply,
      [{ code: "custom", path: ["questionIds"], message: error.message }],
      "The question order must contain every question in this quiz exactly once.",
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
): QuizQuestionRouteServices {
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
    questions: createQuizQuestionService({
      questionRepository: createQuizQuestionRepository(app.db),
      identityRepository,
      teacherProfileRepository: createTeacherProfileRepository(app.db),
    }),
  };
}

export const quizQuestionRoutes: FastifyPluginAsync<
  QuizQuestionRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const authenticatedTeacher = [services.authenticate, requireRole("teacher")];
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );

  app.put(
    "/teacher/quizzes/:quizId/questions/order",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);
      const params = parseOrSendValidation(
        teacherQuizQuestionCollectionParamsSchema,
        request.params,
        reply,
        "The quiz route parameter is invalid.",
      );
      if (!params) return;
      const input = parseOrSendValidation(
        reorderTeacherQuizQuestionsRequestSchema,
        request.body,
        reply,
        "The question order request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.questions.reorderQuestions(
          userId,
          params.quizId,
          input,
        );
        return reply
          .code(200)
          .send(teacherQuizQuestionListResponseSchema.parse(result));
      } catch (error) {
        return handleQuestionError(error, reply);
      }
    },
  );

  app.post(
    "/teacher/quizzes/:quizId/questions",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherQuizQuestionCollectionParamsSchema,
        request.params,
        reply,
        "The quiz route parameter is invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        createTeacherQuizQuestionRequestSchema,
        request.body,
        reply,
        "The question request body is invalid.",
      );
      if (!input) return;

      try {
        const question = await services.questions.createQuestion(
          userId,
          params.quizId,
          input,
        );
        return reply
          .code(201)
          .send(teacherQuizQuestionResponseSchema.parse(question));
      } catch (error) {
        return handleQuestionError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/quizzes/:quizId/questions",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherQuizQuestionCollectionParamsSchema,
        request.params,
        reply,
        "The quiz route parameter is invalid.",
      );
      if (!params) return;

      try {
        const result = await services.questions.listQuestions(
          userId,
          params.quizId,
        );
        return reply
          .code(200)
          .send(teacherQuizQuestionListResponseSchema.parse(result));
      } catch (error) {
        return handleQuestionError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/quizzes/:quizId/questions/:questionId",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherQuizQuestionParamsSchema,
        request.params,
        reply,
        "The quiz or question route parameters are invalid.",
      );
      if (!params) return;

      try {
        const result = await services.questions.getQuestion(
          userId,
          params.quizId,
          params.questionId,
        );
        return reply
          .code(200)
          .send(teacherQuizQuestionResponseSchema.parse(result));
      } catch (error) {
        return handleQuestionError(error, reply);
      }
    },
  );

  app.patch(
    "/teacher/quizzes/:quizId/questions/:questionId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherQuizQuestionParamsSchema,
        request.params,
        reply,
        "The quiz or question route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        updateTeacherQuizQuestionRequestSchema,
        request.body,
        reply,
        "The question update body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.questions.updateQuestion(
          userId,
          params.quizId,
          params.questionId,
          input,
        );
        return reply
          .code(200)
          .send(teacherQuizQuestionResponseSchema.parse(result));
      } catch (error) {
        return handleQuestionError(error, reply);
      }
    },
  );
};
