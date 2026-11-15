import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherLessonListResponse,
  TeacherLessonResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
} from "./course.service.js";
import {
  LessonPositionConflictError,
  LessonOrderMismatchError,
  LessonReorderConflictError,
  LessonServiceValidationError,
  TeacherLessonNotFoundError,
} from "./lesson.service.js";
import { lessonRoutes, type LessonRouteServices } from "./lesson.routes.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const courseId = "550e8400-e29b-41d4-a716-446655440001";
const topicId = "550e8400-e29b-41d4-a716-446655440002";
const lessonId = "550e8400-e29b-41d4-a716-446655440003";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const lesson: TeacherLessonResponse = {
  id: lessonId,
  topicId,
  title: "Introduction",
  content: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const lessonList: TeacherLessonListResponse = { items: [lesson] };

type AuthMode = "teacher" | "student" | "unauthenticated";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: LessonRouteServices = {
    authenticate: async (request, reply) => {
      if (authMode === "unauthenticated") {
        reply.code(401).type("application/problem+json").send({
          type: "urn:edutrack:problem:authentication-required",
          title: "Authentication required",
          status: 401,
          detail: "A valid session is required.",
        });
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
    lessons: {
      createLesson: vi.fn(async () => lesson),
      listTopicLessons: vi.fn(async () => lessonList),
      getLesson: vi.fn(async () => lesson),
      updateLesson: vi.fn(async () => lesson),
      reorderLessons: vi.fn(async () => lessonList),
    },
  };

  await app.register(lessonRoutes, {
    prefix: "/api/v1",
    environment,
    services,
  });
  apps.push(app);

  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const mutationHeaders = {
  origin: environment.FRONTEND_URL,
  "content-type": "application/json",
};

const collectionUrl = `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons`;
const lessonUrl = `${collectionUrl}/${lessonId}`;

describe("lesson routes", () => {
  it("creates an incomplete lesson and returns HTTP 201", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "Introduction" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(lesson);
    expect(services.lessons.createLesson).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      { title: "Introduction" },
    );
  });

  it("lists lessons in the service's server-assigned position order", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: collectionUrl,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(lessonList);
    expect(services.lessons.listTopicLessons).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
    );
  });

  it("retrieves a lesson using all nested route IDs", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: lessonUrl,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(lesson);
    expect(services.lessons.getLesson).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      lessonId,
    );
  });

  it("updates a lesson and returns HTTP 200", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PATCH",
      url: lessonUrl,
      headers: mutationHeaders,
      payload: { title: "Updated lesson" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(lesson);
    expect(services.lessons.updateLesson).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      lessonId,
      { title: "Updated lesson" },
    );
  });

  it("reorders lessons through the authenticated, Origin-protected PUT route", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [lessonId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(lessonList);
    expect(services.lessons.reorderLessons).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      { lessonIds: [lessonId] },
    );
  });

  it("rejects duplicate IDs and maps incomplete order or conflicts", async () => {
    const { app, services } = await createHarness();
    const duplicate = await app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [lessonId, lessonId] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(services.lessons.reorderLessons).not.toHaveBeenCalled();

    vi.mocked(services.lessons.reorderLessons).mockRejectedValueOnce(
      new LessonOrderMismatchError(),
    );
    const incomplete = await app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [] },
    });
    expect(incomplete.statusCode).toBe(400);

    vi.mocked(services.lessons.reorderLessons).mockRejectedValueOnce(
      new LessonReorderConflictError(),
    );
    const conflict = await app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [lessonId] },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("rejects invalid UUIDs and server-controlled request fields", async () => {
    const { app, services } = await createHarness();

    const invalidId = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses/not-a-uuid/topics/topic-id/lessons",
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: {
        title: "Lesson",
        courseId,
        topicId,
        position: 1,
      },
    });
    const invalidPatch = await app.inject({
      method: "PATCH",
      url: lessonUrl,
      headers: mutationHeaders,
      payload: { position: 2 },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidPatch.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.lessons.createLesson).not.toHaveBeenCalled();
    expect(services.lessons.updateLesson).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated users and 403 for non-teachers", async () => {
    const unauthenticated = await createHarness("unauthenticated");
    const student = await createHarness("student");

    const unauthenticatedResponse = await unauthenticated.app.inject({
      method: "GET",
      url: collectionUrl,
    });
    const forbiddenResponse = await student.app.inject({
      method: "GET",
      url: collectionUrl,
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(forbiddenResponse.statusCode).toBe(403);

    const unauthenticatedReorder = await unauthenticated.app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [lessonId] },
    });
    const forbiddenReorder = await student.app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: mutationHeaders,
      payload: { lessonIds: [lessonId] },
    });
    expect(unauthenticatedReorder.statusCode).toBe(401);
    expect(forbiddenReorder.statusCode).toBe(403);
  });

  it("conceals inaccessible courses, topics, and lessons with 404 responses", async () => {
    const { app, services } = await createHarness();

    vi.mocked(services.lessons.listTopicLessons).mockRejectedValue(
      new TeacherCourseNotFoundError(),
    );
    const courseResponse = await app.inject({
      method: "GET",
      url: collectionUrl,
    });

    vi.mocked(services.lessons.getLesson).mockRejectedValue(
      new TeacherTopicNotFoundError(),
    );
    const topicResponse = await app.inject({
      method: "GET",
      url: lessonUrl,
    });

    vi.mocked(services.lessons.getLesson).mockRejectedValue(
      new TeacherLessonNotFoundError(),
    );
    const lessonResponse = await app.inject({
      method: "GET",
      url: lessonUrl,
    });

    expect(courseResponse.statusCode).toBe(404);
    expect(topicResponse.statusCode).toBe(404);
    expect(lessonResponse.statusCode).toBe(404);
    expect(lessonResponse.body).not.toContain("another teacher");
  });

  it("returns 409 for Draft restrictions and position conflicts", async () => {
    const { app, services } = await createHarness();

    vi.mocked(services.lessons.updateLesson).mockRejectedValue(
      new TeacherCourseNotEditableError(),
    );
    const updateResponse = await app.inject({
      method: "PATCH",
      url: lessonUrl,
      headers: mutationHeaders,
      payload: { title: "Changed lesson" },
    });

    vi.mocked(services.lessons.createLesson).mockRejectedValue(
      new LessonPositionConflictError(),
    );
    const createResponse = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "New lesson" },
    });

    expect(updateResponse.statusCode).toBe(409);
    expect(createResponse.statusCode).toBe(409);
  });

  it("maps service validation failures to HTTP 400 Problem Details", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.lessons.createLesson).mockRejectedValue(
      new LessonServiceValidationError([
        {
          code: "custom",
          path: ["title"],
          message: "Invalid lesson title.",
        },
      ]),
    );

    const response = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "Lesson" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:validation-error",
      status: 400,
    });
  });

  it("rejects cross-origin POST, PATCH, and PUT before calling the service", async () => {
    const { app, services } = await createHarness();
    const foreignOriginHeaders = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };

    const postResponse = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: foreignOriginHeaders,
      payload: { title: "New lesson" },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: lessonUrl,
      headers: foreignOriginHeaders,
      payload: { title: "Changed lesson" },
    });
    const reorderResponse = await app.inject({
      method: "PUT",
      url: `${collectionUrl}/order`,
      headers: foreignOriginHeaders,
      payload: { lessonIds: [lessonId] },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(reorderResponse.statusCode).toBe(403);
    expect(services.lessons.createLesson).not.toHaveBeenCalled();
    expect(services.lessons.updateLesson).not.toHaveBeenCalled();
    expect(services.lessons.reorderLessons).not.toHaveBeenCalled();
  });
});
