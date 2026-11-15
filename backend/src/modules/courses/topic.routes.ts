import { ZodError, z } from "zod";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";

import {
  createTeacherTopicRequestSchema,
  reorderTeacherTopicsRequestSchema,
  teacherCourseParamsSchema,
  teacherCourseTopicParamsSchema,
  teacherTopicListResponseSchema,
  teacherTopicResponseSchema,
  updateTeacherTopicRequestSchema,
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
  createTopicService,
  TeacherTopicNotFoundError,
  TopicOrderMismatchError,
  TopicPositionConflictError,
  TopicReorderConflictError,
  TopicServiceValidationError,
} from "./topic.service.js";
import { createTopicRepository } from "./topic.repository.js";

type TopicManagementService = Pick<
  ReturnType<typeof createTopicService>,
  | "createTopic"
  | "listCourseTopics"
  | "getTopic"
  | "updateTopic"
  | "reorderTopics"
>;

export interface TopicRouteServices {
  authenticate: preHandlerHookHandler;
  topics: TopicManagementService;
}

export interface TopicRouteOptions {
  environment: Environment;
  services?: TopicRouteServices;
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

function handleTopicError(error: unknown, reply: FastifyReply) {
  if (error instanceof TopicServiceValidationError) {
    return sendValidationProblem(
      reply,
      error.issues,
      "The topic request is invalid.",
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

  if (error instanceof TeacherCourseNotEditableError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:course-not-editable",
      title: "Course cannot be edited",
      status: 409,
      detail: "Topics can only be changed while the course is a draft.",
    });
  }

  if (error instanceof TopicPositionConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:topic-position-conflict",
      title: "Topic could not be created",
      status: 409,
      detail: "A topic position conflict occurred. Please retry the request.",
    });
  }

  if (error instanceof TopicOrderMismatchError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:invalid-topic-order",
      title: "Invalid topic order",
      status: 400,
      detail: "Provide every topic in this course exactly once.",
    });
  }

  if (error instanceof TopicReorderConflictError) {
    return sendProblem(reply, {
      type: "urn:edutrack:problem:topic-order-conflict",
      title: "Topic order could not be updated",
      status: 409,
      detail: "The topics changed concurrently. Reload and try again.",
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
): TopicRouteServices {
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
    topics: createTopicService({
      topicRepository: createTopicRepository(app.db),
      courseRepository: createCourseRepository(app.db),
      teacherProfileRepository: createTeacherProfileRepository(app.db),
      identityRepository,
    }),
  };
}

export const topicRoutes: FastifyPluginAsync<TopicRouteOptions> = async (
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
    "/teacher/courses/:courseId/topics/order",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) return sendAuthenticationRequired(reply);

      const params = parseOrSendValidation(
        teacherCourseParamsSchema,
        request.params,
        reply,
        "The course route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        reorderTeacherTopicsRequestSchema,
        request.body,
        reply,
        "The topic order request body is invalid.",
      );
      if (!input) return;

      try {
        const result = await services.topics.reorderTopics(
          userId,
          params.courseId,
          input,
        );
        return reply
          .code(200)
          .send(teacherTopicListResponseSchema.parse(result));
      } catch (error) {
        return handleTopicError(error, reply);
      }
    },
  );

  app.post(
    "/teacher/courses/:courseId/topics",
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
      if (!params) return;

      const input = parseOrSendValidation(
        createTeacherTopicRequestSchema,
        request.body,
        reply,
        "The topic request body is invalid.",
      );
      if (!input) return;

      try {
        const topic = await services.topics.createTopic(
          userId,
          params.courseId,
          input,
        );
        return reply.code(201).send(teacherTopicResponseSchema.parse(topic));
      } catch (error) {
        return handleTopicError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics",
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
      if (!params) return;

      try {
        const result = await services.topics.listCourseTopics(
          userId,
          params.courseId,
        );
        return reply
          .code(200)
          .send(teacherTopicListResponseSchema.parse(result));
      } catch (error) {
        return handleTopicError(error, reply);
      }
    },
  );

  app.get(
    "/teacher/courses/:courseId/topics/:topicId",
    { preHandler: authenticatedTeacher },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseTopicParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      try {
        const topic = await services.topics.getTopic(
          userId,
          params.courseId,
          params.topicId,
        );
        return reply.code(200).send(teacherTopicResponseSchema.parse(topic));
      } catch (error) {
        return handleTopicError(error, reply);
      }
    },
  );

  app.patch(
    "/teacher/courses/:courseId/topics/:topicId",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;

      if (!userId) {
        return sendAuthenticationRequired(reply);
      }

      const params = parseOrSendValidation(
        teacherCourseTopicParamsSchema,
        request.params,
        reply,
        "The course or topic route parameters are invalid.",
      );
      if (!params) return;

      const input = parseOrSendValidation(
        updateTeacherTopicRequestSchema,
        request.body,
        reply,
        "The topic update body is invalid.",
      );
      if (!input) return;

      try {
        const topic = await services.topics.updateTopic(
          userId,
          params.courseId,
          params.topicId,
          input,
        );
        return reply.code(200).send(teacherTopicResponseSchema.parse(topic));
      } catch (error) {
        return handleTopicError(error, reply);
      }
    },
  );
};
