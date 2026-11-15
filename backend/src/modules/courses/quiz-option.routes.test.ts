import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TeacherQuizOptionResponse } from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  TeacherCourseNotEditableError,
  TeacherNotEligibleError,
} from "./course.service.js";
import {
  QuizOptionConflictError,
  QuizOptionOrderValidationError,
  TeacherQuizOptionNotFoundError,
} from "./quiz-option.service.js";
import {
  quizOptionRoutes,
  type QuizOptionRouteServices,
} from "./quiz-option.routes.js";
import { TeacherQuizQuestionNotFoundError } from "./quiz-question.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const questionId = "550e8400-e29b-41d4-a716-446655440001";
const optionId = "550e8400-e29b-41d4-a716-446655440002";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const option: TeacherQuizOptionResponse = {
  id: optionId,
  questionId,
  optionText: "4",
  position: 1,
  isCorrect: true,
};
type AuthMode = "teacher" | "student" | "unauthenticated";
const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: QuizOptionRouteServices = {
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
    options: {
      createOption: vi.fn(async () => option),
      updateOption: vi.fn(async () => option),
      reorderOptions: vi.fn(async () => [option]),
    },
  };

  await app.register(quizOptionRoutes, {
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
const collectionUrl = `/api/v1/teacher/questions/${questionId}/options`;
const detailUrl = `${collectionUrl}/${optionId}`;
const orderUrl = `${collectionUrl}/order`;

describe("quiz option routes", () => {
  it("reorders options while preserving the authoring response contract", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { optionIds: [optionId] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([option]);
    expect(services.options.reorderOptions).toHaveBeenCalledWith(
      userId,
      questionId,
      { optionIds: [optionId] },
    );

    const duplicate = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { optionIds: [optionId, optionId] },
    });
    const crossOrigin = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: { ...mutationHeaders, origin: "https://attacker.example" },
      payload: { optionIds: [optionId] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it("requires the Teacher role and maps exact-list mismatch to 400", async () => {
    const student = await createHarness("student");
    const forbidden = await student.app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { optionIds: [optionId] },
    });
    expect(forbidden.statusCode).toBe(403);

    const { app, services } = await createHarness();
    vi.mocked(services.options.reorderOptions).mockRejectedValueOnce(
      new QuizOptionOrderValidationError(),
    );
    const invalid = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { optionIds: [optionId] },
    });
    expect(invalid.statusCode).toBe(400);

    vi.mocked(services.options.reorderOptions).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const draftConflict = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { optionIds: [optionId] },
    });
    expect(draftConflict.statusCode).toBe(409);
  });

  it("creates an incomplete Draft option with HTTP 201", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { optionText: "  4  " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(option);
    expect(services.options.createOption).toHaveBeenCalledWith(
      userId,
      questionId,
      { optionText: "4" },
    );
  });

  it("updates option text and correctness with HTTP 200", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { optionText: "  Four  ", isCorrect: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(option);
    expect(services.options.updateOption).toHaveBeenCalledWith(
      userId,
      questionId,
      optionId,
      { optionText: "Four", isCorrect: true },
    );
  });

  it("returns 400 Problem Details for invalid UUIDs and server-controlled fields", async () => {
    const { app, services } = await createHarness();
    const invalidId = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/questions/${questionId}/options/not-a-uuid`,
      headers: mutationHeaders,
      payload: { optionText: "Updated" },
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { optionText: "Option", questionId, position: 4 },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.options.createOption).not.toHaveBeenCalled();
    expect(services.options.updateOption).not.toHaveBeenCalled();
  });

  it("returns 401 to unauthenticated requests and 403 to non-Teachers", async () => {
    const unauthenticated = await createHarness("unauthenticated");
    const student = await createHarness("student");
    const unauthenticatedResponse = await unauthenticated.app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { optionText: "Option" },
    });
    const forbiddenResponse = await student.app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { isCorrect: false },
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(forbiddenResponse.statusCode).toBe(403);
  });

  it("maps missing resources, Draft restrictions, and option conflicts", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.options.createOption).mockRejectedValueOnce(
      new TeacherQuizQuestionNotFoundError(),
    );
    const missingQuestion = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { optionText: "Option" },
    });

    vi.mocked(services.options.updateOption).mockRejectedValueOnce(
      new TeacherQuizOptionNotFoundError(),
    );
    const missingOption = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { optionText: "Updated" },
    });

    vi.mocked(services.options.updateOption).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const draftConflict = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { isCorrect: false },
    });

    vi.mocked(services.options.updateOption).mockRejectedValueOnce(
      new QuizOptionConflictError("correct_answer"),
    );
    const correctAnswerConflict = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { isCorrect: true },
    });

    expect(missingQuestion.statusCode).toBe(404);
    expect(missingOption.statusCode).toBe(404);
    expect(draftConflict.statusCode).toBe(409);
    expect(correctAnswerConflict.statusCode).toBe(409);

    vi.mocked(services.options.updateOption).mockRejectedValueOnce(
      new TeacherNotEligibleError(),
    );
    const ineligible = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { isCorrect: false },
    });
    expect(ineligible.statusCode).toBe(403);
  });

  it("rejects cross-origin POST and PATCH before invoking services", async () => {
    const { app, services } = await createHarness();
    const headers = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };
    const postResponse = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers,
      payload: { optionText: "Option" },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers,
      payload: { isCorrect: false },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(services.options.createOption).not.toHaveBeenCalled();
    expect(services.options.updateOption).not.toHaveBeenCalled();
  });
});
