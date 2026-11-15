import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherQuizListResponse,
  TeacherQuizResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
} from "./course.service.js";
import {
  QuizOrderValidationError,
  QuizPositionConflictError,
  TeacherQuizNotFoundError,
} from "./quiz.service.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";
import { quizRoutes, type QuizRouteServices } from "./quiz.routes.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const courseId = "550e8400-e29b-41d4-a716-446655440001";
const topicId = "550e8400-e29b-41d4-a716-446655440002";
const quizId = "550e8400-e29b-41d4-a716-446655440003";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const quiz: TeacherQuizResponse = {
  id: quizId,
  topicId,
  title: "Practice",
  description: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const quizList: TeacherQuizListResponse = { items: [quiz] };

type AuthMode = "teacher" | "student" | "unauthenticated";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: QuizRouteServices = {
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
    quizzes: {
      createQuiz: vi.fn(async () => quiz),
      listTopicQuizzes: vi.fn(async () => quizList),
      getQuiz: vi.fn(async () => quiz),
      updateQuiz: vi.fn(async () => quiz),
      reorderQuizzes: vi.fn(async () => quizList),
    },
  };

  await app.register(quizRoutes, {
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

const collectionUrl = `/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes`;
const detailUrl = `${collectionUrl}/${quizId}`;
const orderUrl = `${collectionUrl}/order`;

describe("quiz routes", () => {
  it("reorders quizzes with authenticated Teacher and CSRF/Origin checks", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { quizIds: [quizId] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(quizList);
    expect(services.quizzes.reorderQuizzes).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      { quizIds: [quizId] },
    );

    const invalid = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { quizIds: [quizId, quizId] },
    });
    const crossOrigin = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: { ...mutationHeaders, origin: "https://attacker.example" },
      payload: { quizIds: [quizId] },
    });
    expect(invalid.statusCode).toBe(400);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it("rejects reorder attempts without a Teacher role and maps exact-list mismatch", async () => {
    const student = await createHarness("student");
    const forbidden = await student.app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { quizIds: [quizId] },
    });
    expect(forbidden.statusCode).toBe(403);

    const { app, services } = await createHarness();
    vi.mocked(services.quizzes.reorderQuizzes).mockRejectedValueOnce(
      new QuizOrderValidationError(),
    );
    const mismatched = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { quizIds: [quizId] },
    });
    expect(mismatched.statusCode).toBe(400);

    vi.mocked(services.quizzes.reorderQuizzes).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const draftConflict = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { quizIds: [quizId] },
    });
    expect(draftConflict.statusCode).toBe(409);
  });

  it("creates a quiz with server-assigned fields and returns HTTP 201", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "  Practice  " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(quiz);
    expect(services.quizzes.createQuiz).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      { title: "Practice" },
    );
  });

  it("lists quizzes in service-provided position order", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: collectionUrl,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(quizList);
    expect(services.quizzes.listTopicQuizzes).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
    );
  });

  it("retrieves one quiz within the requested course and topic", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: detailUrl,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(quiz);
    expect(services.quizzes.getQuiz).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      quizId,
    );
  });

  it("updates a quiz and returns HTTP 200", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { title: "  Updated practice  ", description: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(quiz);
    expect(services.quizzes.updateQuiz).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      quizId,
      { title: "Updated practice", description: null },
    );
  });

  it("rejects invalid IDs and client-supplied server-managed fields", async () => {
    const { app, services } = await createHarness();

    const invalidId = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/not-a-uuid/topics/${topicId}/quizzes`,
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "Practice", position: 1, topicId },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.quizzes.createQuiz).not.toHaveBeenCalled();
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
  });

  it("conceals inaccessible courses, topics, and quizzes with 404", async () => {
    const { app, services } = await createHarness();

    vi.mocked(services.quizzes.listTopicQuizzes).mockRejectedValueOnce(
      new TeacherCourseNotFoundError(),
    );
    const missingCourse = await app.inject({
      method: "GET",
      url: collectionUrl,
    });

    vi.mocked(services.quizzes.listTopicQuizzes).mockRejectedValueOnce(
      new TeacherTopicNotFoundError(),
    );
    const missingTopic = await app.inject({
      method: "GET",
      url: collectionUrl,
    });

    vi.mocked(services.quizzes.getQuiz).mockRejectedValueOnce(
      new TeacherQuizNotFoundError(),
    );
    const missingQuiz = await app.inject({
      method: "GET",
      url: detailUrl,
    });

    expect(missingCourse.statusCode).toBe(404);
    expect(missingTopic.statusCode).toBe(404);
    expect(missingQuiz.statusCode).toBe(404);
  });

  it("returns 409 for non-Draft mutations and position conflicts", async () => {
    const { app, services } = await createHarness();

    vi.mocked(services.quizzes.updateQuiz).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const nonDraftUpdate = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { title: "Updated" },
    });

    vi.mocked(services.quizzes.createQuiz).mockRejectedValueOnce(
      new QuizPositionConflictError(),
    );
    const positionConflict = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { title: "Another quiz" },
    });

    expect(nonDraftUpdate.statusCode).toBe(409);
    expect(positionConflict.statusCode).toBe(409);
  });

  it("rejects cross-origin POST and PATCH before calling the service", async () => {
    const { app, services } = await createHarness();
    const headers = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };

    const postResponse = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers,
      payload: { title: "Practice" },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers,
      payload: { title: "Updated" },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(services.quizzes.createQuiz).not.toHaveBeenCalled();
    expect(services.quizzes.updateQuiz).not.toHaveBeenCalled();
  });
});
