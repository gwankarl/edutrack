import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import {
  courseThumbnailRoutes,
  type CourseThumbnailRouteServices,
} from "./course-thumbnail.routes.js";
import {
  CourseThumbnailConfigurationError,
  CourseThumbnailNotEditableError,
  CourseThumbnailNotFoundError,
  CourseThumbnailStorageError,
} from "./course-thumbnail.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const courseId = "550e8400-e29b-41d4-a716-446655440001";
const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

type AuthMode = "teacher" | "student" | "unauthenticated";
const apps: Array<ReturnType<typeof Fastify>> = [];

async function harness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  const services: CourseThumbnailRouteServices = {
    authenticate: async (request, reply) => {
      if (authMode === "unauthenticated") {
        reply.code(401).send({ status: 401 });
        return;
      }
      request.authContext = {
        userId,
        user: {
          id: userId,
          displayName: "Synthetic Teacher",
          email: "teacher@example.test",
        },
        roles: authMode === "teacher" ? ["student", "teacher"] : ["student"],
      };
    },
    thumbnails: {
      upload: vi.fn(async () => ({
        url: "https://images.example.test/course.webp",
        width: 640,
        height: 360,
        format: "webp" as const,
      })),
      remove: vi.fn(async () => undefined),
      processPendingCleanup: vi.fn(async () => undefined),
    },
  };
  await app.register(courseThumbnailRoutes, {
    prefix: "/api/v1",
    environment,
    services,
  });
  await app.ready();
  apps.push(app);
  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const boundary = "----edutrack-thumbnail-test-boundary";
const pngSignature = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/B8sAAAAASUVORK5CYII=",
  "base64",
);
function multipartPayload(image = pngSignature) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="thumb.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

const uploadHeaders = {
  origin: environment.FRONTEND_URL,
  "sec-fetch-site": "same-origin",
  "content-type": `multipart/form-data; boundary=${boundary}`,
};

describe("course thumbnail routes", () => {
  it("uploads and replaces an owner's thumbnail through multipart form data", async () => {
    const { app, services } = await harness();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: multipartPayload(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      thumbnail: {
        url: "https://images.example.test/course.webp",
        width: 640,
        height: 360,
        format: "webp",
      },
    });
    expect(services.thumbnails.upload).toHaveBeenCalledWith(
      userId,
      courseId,
      pngSignature,
      "png",
    );
  });

  it("requires a valid origin, authenticated session, and Teacher role", async () => {
    const { app } = await harness();
    const csrf = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: { ...uploadHeaders, origin: "https://evil.example" },
      payload: multipartPayload(),
    });
    expect(csrf.statusCode).toBe(403);

    const { app: studentApp } = await harness("student");
    const denied = await studentApp.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: multipartPayload(),
    });
    expect(denied.statusCode).toBe(403);

    const { app: anonymousApp } = await harness("unauthenticated");
    const anonymous = await anonymousApp.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: multipartPayload(),
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("rejects invalid course IDs and file contents", async () => {
    const { app } = await harness();
    const invalidId = await app.inject({
      method: "POST",
      url: "/api/v1/teacher/courses/not-a-uuid/thumbnail",
      headers: uploadHeaders,
      payload: multipartPayload(),
    });
    expect(invalidId.statusCode).toBe(400);
    const invalidFile = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: multipartPayload(Buffer.from("not an image")),
    });
    expect(invalidFile.statusCode).toBe(400);
  });

  it("rejects files larger than 5 MB", async () => {
    const { app } = await harness();
    const oversized = multipartPayload(
      Buffer.concat([pngSignature, Buffer.alloc(5 * 1024 * 1024)]),
    );
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: oversized,
    });
    expect(response.statusCode).toBe(413);
  });

  it("removes a thumbnail with an authorized same-origin DELETE", async () => {
    const { app, services } = await harness();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: {
        origin: environment.FRONTEND_URL,
        "sec-fetch-site": "same-origin",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(services.thumbnails.remove).toHaveBeenCalledWith(userId, courseId);
  });

  it.each([
    [404, new CourseThumbnailNotFoundError()],
    [409, new CourseThumbnailNotEditableError()],
    [502, new CourseThumbnailStorageError()],
    [503, new CourseThumbnailConfigurationError()],
  ])("maps thumbnail failure to HTTP %i", async (status, error) => {
    const { app, services } = await harness();
    vi.mocked(services.thumbnails.upload).mockRejectedValueOnce(error);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/thumbnail`,
      headers: uploadHeaders,
      payload: multipartPayload(),
    });
    expect(response.statusCode).toBe(status);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
  });
});
