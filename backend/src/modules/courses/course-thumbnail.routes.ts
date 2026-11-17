import { fileTypeFromBuffer } from "file-type";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  preHandlerHookHandler,
} from "fastify";
import { ZodError } from "zod";

import { teacherCourseParamsSchema } from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { createIdentityRepository } from "../identity/identity.repository.js";
import { createSessionRepository } from "../identity/session.repository.js";
import { createSessionService } from "../identity/session.service.js";
import { createAuthenticate } from "../../shared/authorization/authenticate.js";
import { createCookieMutationGuard } from "../../shared/authorization/cookie-mutation-guard.js";
import { requireRole } from "../../shared/authorization/require-role.js";
import { createTeacherProfileRepository } from "../teachers/teacher-profile.repository.js";
import { createCourseThumbnailRepository } from "./course-thumbnail.repository.js";
import {
  CourseThumbnailConfigurationError,
  CourseThumbnailNotEditableError,
  CourseThumbnailNotFoundError,
  CourseThumbnailStorageError,
  CourseThumbnailTeacherRequiredError,
  createCourseThumbnailService,
} from "./course-thumbnail.service.js";

export const COURSE_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

type ThumbnailService = ReturnType<typeof createCourseThumbnailService>;

export interface CourseThumbnailRouteServices {
  authenticate: preHandlerHookHandler;
  thumbnails: Pick<
    ThumbnailService,
    "upload" | "remove" | "processPendingCleanup"
  >;
}

export interface CourseThumbnailRouteOptions {
  environment: Environment;
  services?: CourseThumbnailRouteServices;
}

function sendProblem(
  reply: Parameters<preHandlerHookHandler>[1],
  status: number,
  type: string,
  title: string,
  detail: string,
) {
  return reply.code(status).type("application/problem+json").send({
    type,
    title,
    status,
    detail,
  });
}

function sendValidation(
  reply: Parameters<preHandlerHookHandler>[1],
  error: ZodError,
) {
  return reply
    .code(400)
    .type("application/problem+json")
    .send({
      type: "urn:edutrack:problem:validation-error",
      title: "Invalid request",
      status: 400,
      detail: "The course thumbnail request is invalid.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
}

function createRouteServices(
  app: FastifyInstance,
  environment: Environment,
): CourseThumbnailRouteServices {
  const identityRepository = createIdentityRepository(app.db);
  const sessionService = createSessionService(createSessionRepository(app.db), {
    sessionLifetimeSeconds: environment.SESSION_TTL_SECONDS,
  });
  const thumbnails = createCourseThumbnailService({
    environment,
    repository: createCourseThumbnailRepository(app.db),
    identityRepository,
    teacherProfileRepository: createTeacherProfileRepository(app.db),
  });

  return {
    authenticate: createAuthenticate({
      environment,
      sessionService,
      identityRepository,
    }),
    thumbnails,
  };
}

export const courseThumbnailRoutes: FastifyPluginAsync<
  CourseThumbnailRouteOptions
> = async (app, { environment, services: injectedServices }) => {
  const services = injectedServices ?? createRouteServices(app, environment);
  const authenticatedTeacher = [services.authenticate, requireRole("teacher")];
  const mutationGuard = createCookieMutationGuard(
    new URL(environment.FRONTEND_URL).origin,
    false,
  );

  const cleanupTimer = setInterval(() => {
    void services.thumbnails.processPendingCleanup().catch(() => {
      app.log.error("Course thumbnail cleanup attempt failed.");
    });
  }, 60_000);
  cleanupTimer.unref();
  app.addHook("onClose", async () => clearInterval(cleanupTimer));
  void services.thumbnails.processPendingCleanup().catch(() => {
    app.log.error("Course thumbnail cleanup attempt failed.");
  });

  app.post(
    "/teacher/courses/:courseId/thumbnail",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) {
        return sendProblem(
          reply,
          401,
          "urn:edutrack:problem:authentication-required",
          "Authentication required",
          "A valid session is required.",
        );
      }

      let params;
      try {
        params = teacherCourseParamsSchema.parse(request.params);
      } catch (error) {
        if (error instanceof ZodError) return sendValidation(reply, error);
        throw error;
      }

      let buffer: Buffer;
      try {
        const parts = request.parts({
          limits: {
            fileSize: COURSE_THUMBNAIL_MAX_BYTES,
            files: 1,
            fields: 0,
            parts: 1,
          },
        });
        const first = await parts.next();
        if (
          first.done ||
          first.value.type !== "file" ||
          first.value.fieldname !== "file"
        ) {
          return sendProblem(
            reply,
            400,
            "urn:edutrack:problem:thumbnail-file-required",
            "Image required",
            "Upload one image using the file field.",
          );
        }
        buffer = await first.value.toBuffer();
        const extra = await parts.next();
        if (!extra.done) {
          return sendProblem(
            reply,
            400,
            "urn:edutrack:problem:invalid-thumbnail-parts",
            "Invalid upload",
            "Upload only one image and no additional fields.",
          );
        }
      } catch (error) {
        const errorCode =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "";
        const tooLarge =
          errorCode === "FST_REQ_FILE_TOO_LARGE" ||
          (error instanceof Error &&
            /file size limit|file too large|request file too large/i.test(
              error.message,
            ));
        if (tooLarge) {
          return sendProblem(
            reply,
            413,
            "urn:edutrack:problem:thumbnail-too-large",
            "Image too large",
            "Course images must be 5 MB or smaller.",
          );
        }
        return sendProblem(
          reply,
          400,
          "urn:edutrack:problem:invalid-thumbnail-upload",
          "Invalid upload",
          "Upload one valid image file.",
        );
      }

      const detected = await fileTypeFromBuffer(buffer);
      const accepted = new Set(["jpg", "png", "webp"]);
      if (!detected || !accepted.has(detected.ext)) {
        return sendProblem(
          reply,
          400,
          "urn:edutrack:problem:unsupported-thumbnail-format",
          "Unsupported image format",
          "Use a JPEG, PNG, or WebP image.",
        );
      }

      try {
        const thumbnail = await services.thumbnails.upload(
          userId,
          params.courseId,
          buffer,
          detected.ext as "jpg" | "png" | "webp",
        );
        return reply.code(200).send({ thumbnail });
      } catch (error) {
        if (error instanceof CourseThumbnailConfigurationError) {
          return sendProblem(
            reply,
            503,
            "urn:edutrack:problem:thumbnail-storage-unavailable",
            "Image storage unavailable",
            "Course image uploads are not configured.",
          );
        }
        if (error instanceof CourseThumbnailTeacherRequiredError) {
          return sendProblem(
            reply,
            403,
            "urn:edutrack:problem:teacher-role-required",
            "Teacher access required",
            "An approved Teacher account is required.",
          );
        }
        if (error instanceof CourseThumbnailNotFoundError) {
          return sendProblem(
            reply,
            404,
            "urn:edutrack:problem:course-not-found",
            "Course not found",
            "The requested course was not found.",
          );
        }
        if (error instanceof CourseThumbnailNotEditableError) {
          return sendProblem(
            reply,
            409,
            "urn:edutrack:problem:course-not-editable",
            "Course cannot be edited",
            "Only draft courses can change their thumbnail.",
          );
        }
        if (error instanceof CourseThumbnailStorageError) {
          return sendProblem(
            reply,
            502,
            "urn:edutrack:problem:thumbnail-storage-failed",
            "Image upload failed",
            "The image could not be uploaded. Please try again.",
          );
        }
        throw error;
      }
    },
  );

  app.delete(
    "/teacher/courses/:courseId/thumbnail",
    { preHandler: [mutationGuard, ...authenticatedTeacher] },
    async (request, reply) => {
      const userId = request.authContext?.userId;
      if (!userId) {
        return sendProblem(
          reply,
          401,
          "urn:edutrack:problem:authentication-required",
          "Authentication required",
          "A valid session is required.",
        );
      }

      let params;
      try {
        params = teacherCourseParamsSchema.parse(request.params);
      } catch (error) {
        if (error instanceof ZodError) return sendValidation(reply, error);
        throw error;
      }

      try {
        await services.thumbnails.remove(userId, params.courseId);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof CourseThumbnailConfigurationError) {
          return sendProblem(
            reply,
            503,
            "urn:edutrack:problem:thumbnail-storage-unavailable",
            "Image storage unavailable",
            "Course image management is not configured.",
          );
        }
        if (error instanceof CourseThumbnailTeacherRequiredError) {
          return sendProblem(
            reply,
            403,
            "urn:edutrack:problem:teacher-role-required",
            "Teacher access required",
            "An approved Teacher account is required.",
          );
        }
        if (error instanceof CourseThumbnailNotFoundError) {
          return sendProblem(
            reply,
            404,
            "urn:edutrack:problem:course-not-found",
            "Course not found",
            "The requested course was not found.",
          );
        }
        if (error instanceof CourseThumbnailNotEditableError) {
          return sendProblem(
            reply,
            409,
            "urn:edutrack:problem:course-not-editable",
            "Course cannot be edited",
            "Only draft courses can change their thumbnail.",
          );
        }
        throw error;
      }
    },
  );
};
