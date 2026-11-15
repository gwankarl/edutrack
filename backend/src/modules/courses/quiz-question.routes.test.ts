import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherQuizQuestionListResponse,
  TeacherQuizQuestionResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  TeacherCourseNotEditableError,
  TeacherNotEligibleError,
} from "./course.service.js";
import {
  QuizQuestionOrderValidationError,
  QuizQuestionPositionConflictError,
  TeacherQuizQuestionNotFoundError,
} from "./quiz-question.service.js";
import {
  quizQuestionRoutes,
  type QuizQuestionRouteServices,
} from "./quiz-question.routes.js";
import { TeacherQuizNotFoundError } from "./quiz.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const quizId = "550e8400-e29b-41d4-a716-446655440001";
const questionId = "550e8400-e29b-41d4-a716-446655440002";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const question: TeacherQuizQuestionResponse = {
  id: questionId,
  quizId,
  questionText: "What is 2 + 2?",
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
  options: [
    {
      id: "550e8400-e29b-41d4-a716-446655440003",
      questionId,
      optionText: "4",
      position: 1,
      isCorrect: true,
    },
  ],
};
const questionList: TeacherQuizQuestionListResponse = { items: [question] };
type AuthMode = "teacher" | "student" | "unauthenticated";
const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: QuizQuestionRouteServices = {
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
    questions: {
      createQuestion: vi.fn(async () => question),
      listQuestions: vi.fn(async () => questionList),
      getQuestion: vi.fn(async () => question),
      updateQuestion: vi.fn(async () => question),
      reorderQuestions: vi.fn(async () => questionList),
    },
  };

  await app.register(quizQuestionRoutes, {
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
const collectionUrl = `/api/v1/teacher/quizzes/${quizId}/questions`;
const detailUrl = `${collectionUrl}/${questionId}`;
const orderUrl = `${collectionUrl}/order`;

describe("quiz question routes", () => {
  it("reorders questions with Teacher auth and rejects malformed or cross-origin requests", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { questionIds: [questionId] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(questionList);
    expect(services.questions.reorderQuestions).toHaveBeenCalledWith(
      userId,
      quizId,
      { questionIds: [questionId] },
    );

    const invalid = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { questionIds: [questionId, questionId] },
    });
    const crossOrigin = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: { ...mutationHeaders, origin: "https://attacker.example" },
      payload: { questionIds: [questionId] },
    });
    expect(invalid.statusCode).toBe(400);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it("maps missing, invalid membership, and unauthorized reorder requests", async () => {
    const anonymous = await createHarness("unauthenticated");
    const unauthenticated = await anonymous.app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { questionIds: [questionId] },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const { app, services } = await createHarness();
    vi.mocked(services.questions.reorderQuestions).mockRejectedValueOnce(
      new QuizQuestionOrderValidationError(),
    );
    const invalidMembership = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { questionIds: [questionId] },
    });
    expect(invalidMembership.statusCode).toBe(400);

    vi.mocked(services.questions.reorderQuestions).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const draftConflict = await app.inject({
      method: "PUT",
      url: orderUrl,
      headers: mutationHeaders,
      payload: { questionIds: [questionId] },
    });
    expect(draftConflict.statusCode).toBe(409);
  });

  it("creates a question with HTTP 201 using the session user", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { questionText: "  What is 2 + 2?  " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(question);
    expect(services.questions.createQuestion).toHaveBeenCalledWith(
      userId,
      quizId,
      { questionText: "What is 2 + 2?" },
    );
  });

  it("lists ordered questions, including authorized answer correctness", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({ method: "GET", url: collectionUrl });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(questionList);
    expect(services.questions.listQuestions).toHaveBeenCalledWith(
      userId,
      quizId,
    );
    expect(response.json().items[0].options[0].isCorrect).toBe(true);
  });

  it("retrieves and updates a question with HTTP 200", async () => {
    const { app, services } = await createHarness();
    const getResponse = await app.inject({ method: "GET", url: detailUrl });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { questionText: "  Updated question?  " },
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(question);
    expect(patchResponse.statusCode).toBe(200);
    expect(services.questions.getQuestion).toHaveBeenCalledWith(
      userId,
      quizId,
      questionId,
    );
    expect(services.questions.updateQuestion).toHaveBeenCalledWith(
      userId,
      quizId,
      questionId,
      { questionText: "Updated question?" },
    );
  });

  it("returns 400 Problem Details for invalid IDs and client-controlled fields", async () => {
    const { app, services } = await createHarness();
    const invalidId = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/quizzes/not-a-uuid/questions",
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { questionText: "Question", position: 7, quizId },
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(services.questions.createQuestion).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated requests and 403 for non-Teachers", async () => {
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

  it("maps missing quiz/question, Draft restriction, and position conflict", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.questions.listQuestions).mockRejectedValueOnce(
      new TeacherQuizNotFoundError(),
    );
    const missingQuiz = await app.inject({ method: "GET", url: collectionUrl });

    vi.mocked(services.questions.getQuestion).mockRejectedValueOnce(
      new TeacherQuizQuestionNotFoundError(),
    );
    const missingQuestion = await app.inject({ method: "GET", url: detailUrl });

    vi.mocked(services.questions.updateQuestion).mockRejectedValueOnce(
      new TeacherCourseNotEditableError(),
    );
    const draftConflict = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers: mutationHeaders,
      payload: { questionText: "Updated" },
    });

    vi.mocked(services.questions.createQuestion).mockRejectedValueOnce(
      new QuizQuestionPositionConflictError(),
    );
    const positionConflict = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers: mutationHeaders,
      payload: { questionText: "Another question" },
    });

    expect(missingQuiz.statusCode).toBe(404);
    expect(missingQuestion.statusCode).toBe(404);
    expect(draftConflict.statusCode).toBe(409);
    expect(positionConflict.statusCode).toBe(409);

    vi.mocked(services.questions.getQuestion).mockRejectedValueOnce(
      new TeacherNotEligibleError(),
    );
    const ineligible = await app.inject({ method: "GET", url: detailUrl });
    expect(ineligible.statusCode).toBe(403);
  });

  it("rejects cross-origin POST and PATCH before calling services", async () => {
    const { app, services } = await createHarness();
    const headers = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };
    const postResponse = await app.inject({
      method: "POST",
      url: collectionUrl,
      headers,
      payload: { questionText: "Question" },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: detailUrl,
      headers,
      payload: { questionText: "Updated" },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(services.questions.createQuestion).not.toHaveBeenCalled();
    expect(services.questions.updateQuestion).not.toHaveBeenCalled();
  });
});
