import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherQuizOptionRequestSchema,
  reorderTeacherQuizOptionsRequestSchema,
  teacherQuizOptionListResponseSchema,
  teacherQuizOptionParamsSchema,
  teacherQuizOptionResponseSchema,
  updateTeacherQuizOptionRequestSchema,
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
import { createQuizOptionRepository } from "./quiz-option.repository.js";
import {
  createQuizOptionService,
  QuizOptionConflictError,
  QuizOptionOrderValidationError,
  QuizOptionServiceValidationError,
  TeacherQuizOptionNotFoundError,
} from "./quiz-option.service.js";
import { TeacherQuizQuestionNotFoundError } from "./quiz-question.service.js";

type OptionOperations = Pick<
  ReturnType<typeof createQuizOptionService>,
  "createOption" | "updateOption" | "reorderOptions"
>;

export interface QuizOptionRouteServices {
  authenticate: preHandlerHookHandler;
  options: OptionOperations;
}

export interface QuizOptionRouteOptions {
  environment: Environment;
  services?: QuizOptionRouteServices;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: Array<{ field: string; message: string }>;
}

// The shared contract has both params for PATCH; derive the POST params from it
// instead of duplicating UUID validation.
const createOptionParamsSchema = teacherQuizOptionParamsSchema.pick({
  questionId: true,
});

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

function handleOptionError(error: unknown, reply: FastifyReply) {
  if (error instanceof QuizOptionServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The answer option request is invalid.",
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

  if (error instanceof TeacherQuizQuestionNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-question-not-found",
      title: "Question not found",
      status: 404,
      detail: "The requested question was not found.",
    });
  }

  if (error instanceof TeacherQuizOptionNotFoundError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:quiz-option-not-found",
      title: "Answer option not found",
      status: 404,
      detail: "The requested answer option was not found.",
    });
  }

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Answer options can only be changed while the course is a draft.",
    });
  }

  if (error instanceof QuizOptionConflictError) {
    return sendProblem(reply, {
      type: `urn:edutrack:problem:quiz-option-${error.reason}-conflict`,
      title: "Answer option conflict",
      status: 409,
      detail:
        error.reason === "correct_answer"
          ? "The correct answer could not be changed."
          : "An answer option position conflict occurred. Please retry.",
    });
  }

  if (error instanceof QuizOptionOrderValidationError) {
    return sendValidationProblem(
      reply,
      [{ code: "custom", path: ["optionIds"], message: error.message }],
      "The option order must contain every answer option for this question exactly once.",
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
): QuizOptionRouteServices {
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
    options: createQuizOptionService({
      optionRepository: createQuizOptionRepository(app.db),
      identityRepository,
      teacherProfileRepository: createTeacherProfileRepository(app.db),
    }),
  };
}

export const quizOptionRoutes: FastifyPluginAsync<
  QuizOptionRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const authenticatedTeacher = [services.authenticate, requireRole("teacher")];
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    true,
  );

  app.put(
    "/teacher/questions/:questionId/options/order",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);
      const params = parseOrSendValidation(
        createOptionParamsSchema,
        request.params,
        reply,
        "The question route parameter is invalid.",
      );
      if (!params) return;
      const input = parseOrSendValidation(
        reorderTeacherQuizOptionsRequestSchema,
        request.body,
        reply,
        "The option order request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.options.reorderOptions(
          userId,
          params.questionId,
          input,
        );
        return reply
          .code(200)
          .send(teacherQuizOptionListResponseSchema.parse(result));
      } catch (error) {
        return handleOptionError(error, reply);
      }
    },
  );

  app.post(
    "/teacher/questions/:questionId/options",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        createOptionParamsSchema,
        request.params,
        reply,
        "The question route parameter is invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        createTeacherQuizOptionRequestSchema,
        request.body,
        reply,
        "The answer option request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.options.createOption(
          userId,
          params.questionId,
          input,
        );
        return reply
          .code(201)
          .send(teacherQuizOptionResponseSchema.parse(result));
      } catch (error) {
        return handleOptionError(error, reply);
      }
    },
  );

  app.patch(
    "/teacher/questions/:questionId/options/:optionId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherQuizOptionParamsSchema,
        request.params,
        reply,
        "The question or option route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        updateTeacherQuizOptionRequestSchema,
        request.body,
        reply,
        "The answer option update body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.options.updateOption(
          userId,
          params.questionId,
          params.optionId,
          input,
        );
        return reply
          .code(200)
          .send(teacherQuizOptionResponseSchema.parse(result));
      } catch (error) {
        return handleOptionError(error, reply);
      }
    },
  );
};
