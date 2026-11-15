import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherTopicListResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
} from "./course.service.js";
import {
  TeacherTopicNotFoundError,
  TopicOrderMismatchError,
  TopicPositionConflictError,
  TopicReorderConflictError,
} from "./topic.service.js";
import { topicRoutes, type TopicRouteServices } from "./topic.routes.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const courseId = "550e8400-e29b-41d4-a716-446655440001";
const topicId = "550e8400-e29b-41d4-a716-446655440002";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const topic: TeacherTopicResponse = {
  id: topicId,
  courseId,
  title: "Number Systems",
  description: null,
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const topicList: TeacherTopicListResponse = { items: [topic] };

type AuthMode = "teacher" | "student" | "unauthenticated";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: TopicRouteServices = {
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
    topics: {
      createTopic: vi.fn(async () => topic),
      listCourseTopics: vi.fn(async () => topicList),
      getTopic: vi.fn(async () => topic),
      updateTopic: vi.fn(async () => topic),
      reorderTopics: vi.fn(async () => topicList),
    },
  };

  await app.register(topicRoutes, {
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

describe("topic routes", () => {
  it("creates a topic and returns HTTP 201", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
      headers: mutationHeaders,
      payload: { title: "Number Systems" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(topic);
    expect(services.topics.createTopic).toHaveBeenCalledWith(userId, courseId, {
      title: "Number Systems",
    });
  });

  it("lists course topics and returns the service ordering", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(topicList);
    expect(services.topics.listCourseTopics).toHaveBeenCalledWith(
      userId,
      courseId,
    );
  });

  it("retrieves a topic by its course and topic IDs", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(topic);
    expect(services.topics.getTopic).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
    );
  });

  it("updates a topic and returns HTTP 200", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
      headers: mutationHeaders,
      payload: { title: "Updated topic" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(topic);
    expect(services.topics.updateTopic).toHaveBeenCalledWith(
      userId,
      courseId,
      topicId,
      { title: "Updated topic" },
    );
  });

  it("reorders topics through the authenticated, Origin-protected PUT route", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [topicId] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(topicList);
    expect(services.topics.reorderTopics).toHaveBeenCalledWith(
      userId,
      courseId,
      { topicIds: [topicId] },
    );
  });

  it("rejects duplicate IDs and maps incomplete order or conflicts", async () => {
    const { app, services } = await createHarness();
    const duplicate = await app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [topicId, topicId] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(services.topics.reorderTopics).not.toHaveBeenCalled();

    vi.mocked(services.topics.reorderTopics).mockRejectedValueOnce(
      new TopicOrderMismatchError(),
    );
    const incomplete = await app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [] },
    });
    expect(incomplete.statusCode).toBe(400);

    vi.mocked(services.topics.reorderTopics).mockRejectedValueOnce(
      new TopicReorderConflictError(),
    );
    const conflict = await app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [topicId] },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it("rejects invalid UUIDs and server-controlled body fields", async () => {
    const { app, services } = await createHarness();

    const invalidId = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses/not-a-uuid/topics",
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
      headers: mutationHeaders,
      payload: { title: "Topic", position: 1, courseId },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.topics.createTopic).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated users and 403 for non-teachers", async () => {
    const unauthenticated = await createHarness("unauthenticated");
    const student = await createHarness("student");

    const unauthenticatedResponse = await unauthenticated.app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
    });
    const forbiddenResponse = await student.app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(forbiddenResponse.statusCode).toBe(403);

    const unauthenticatedReorder = await unauthenticated.app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [topicId] },
    });
    const forbiddenReorder = await student.app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: mutationHeaders,
      payload: { topicIds: [topicId] },
    });
    expect(unauthenticatedReorder.statusCode).toBe(401);
    expect(forbiddenReorder.statusCode).toBe(403);
  });

  it("maps inaccessible courses and topics to 404", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.topics.getTopic).mockRejectedValue(
      new TeacherTopicNotFoundError(),
    );

    const topicResponse = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
    });

    expect(topicResponse.statusCode).toBe(404);
    expect(topicResponse.body).not.toContain("another teacher");

    vi.mocked(services.topics.listCourseTopics).mockRejectedValue(
      new TeacherCourseNotFoundError(),
    );
    const courseResponse = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
    });

    expect(courseResponse.statusCode).toBe(404);
  });

  it("returns 409 when Draft restrictions or position conflicts prevent a mutation", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.topics.updateTopic).mockRejectedValue(
      new TeacherCourseNotEditableError(),
    );

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
      headers: mutationHeaders,
      payload: { title: "Changed topic" },
    });

    vi.mocked(services.topics.createTopic).mockRejectedValue(
      new TopicPositionConflictError(),
    );
    const createResponse = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
      headers: mutationHeaders,
      payload: { title: "New topic" },
    });

    expect(updateResponse.statusCode).toBe(409);
    expect(createResponse.statusCode).toBe(409);
  });

  it("rejects cross-origin POST and PATCH requests", async () => {
    const { app, services } = await createHarness();
    const foreignOriginHeaders = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };

    const postResponse = await app.inject({
      method: "POST",
      url: `/api/v1/teacher/courses/${courseId}/topics`,
      headers: foreignOriginHeaders,
      payload: { title: "New topic" },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}/topics/${topicId}`,
      headers: foreignOriginHeaders,
      payload: { title: "Changed topic" },
    });
    const reorderResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/teacher/courses/${courseId}/topics/order`,
      headers: foreignOriginHeaders,
      payload: { topicIds: [topicId] },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(reorderResponse.statusCode).toBe(403);
    expect(services.topics.createTopic).not.toHaveBeenCalled();
    expect(services.topics.updateTopic).not.toHaveBeenCalled();
    expect(services.topics.reorderTopics).not.toHaveBeenCalled();
  });
});
