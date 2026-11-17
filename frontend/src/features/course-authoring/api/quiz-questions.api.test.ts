import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherQuizQuestion,
  getTeacherQuizQuestion,
  listTeacherQuizQuestions,
  reorderTeacherQuizQuestions,
  updateTeacherQuizQuestion,
} from "./quiz-questions.api.js";

afterEach(() => vi.unstubAllGlobals());

const quizId = "550e8400-e29b-41d4-a716-446655440022";
const questionId = "550e8400-e29b-41d4-a716-446655440023";
const question = {
  id: questionId,
  quizId,
  questionText: "Solve for x",
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  options: [],
};

function stubResponses(
  ...responses: Array<{ body: unknown; status?: number }>
) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("quiz question API client", () => {
  it("creates, lists, retrieves, updates, and reorders questions", async () => {
    const list = { items: [question] };
    const fetchMock = stubResponses(
      { body: question, status: 201 },
      { body: list },
      { body: question },
      { body: { ...question, questionText: "Find x" } },
      { body: list },
    );

    await expect(
      createTeacherQuizQuestion(quizId, { questionText: "  Solve for x  " }),
    ).resolves.toEqual(question);
    await expect(listTeacherQuizQuestions(quizId)).resolves.toEqual(list);
    await expect(getTeacherQuizQuestion(quizId, questionId)).resolves.toEqual(
      question,
    );
    await expect(
      updateTeacherQuizQuestion(quizId, questionId, {
        questionText: "Find x",
      }),
    ).resolves.toEqual({ ...question, questionText: "Find x" });
    await expect(
      reorderTeacherQuizQuestions(quizId, { questionIds: [questionId] }),
    ).resolves.toEqual(list);

    expect(
      fetchMock.mock.calls.map(([url, options]) => [url, options?.method]),
    ).toEqual([
      [`/api/v1/teacher/quizzes/${quizId}/questions`, "POST"],
      [`/api/v1/teacher/quizzes/${quizId}/questions`, "GET"],
      [`/api/v1/teacher/quizzes/${quizId}/questions/${questionId}`, "GET"],
      [`/api/v1/teacher/quizzes/${quizId}/questions/${questionId}`, "PATCH"],
      [`/api/v1/teacher/quizzes/${quizId}/questions/order`, "PUT"],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      body: JSON.stringify({ questionText: "Solve for x" }),
    });
  });

  it("validates inputs and response shapes, and preserves auth/validation errors", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listTeacherQuizQuestions("invalid")).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      createTeacherQuizQuestion(quizId, { questionText: " " }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      reorderTeacherQuizQuestions(quizId, {
        questionIds: [questionId, questionId],
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();

    stubResponses({ body: { items: [{ ...question, options: "bad" }] } });
    await expect(listTeacherQuizQuestions(quizId)).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });

    for (const status of [400, 401, 403, 404, 409]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              title: "Question request failed",
              detail: "Request rejected",
              status,
              errors: [{ field: "questionText", message: "Invalid" }],
            }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(
        getTeacherQuizQuestion(quizId, questionId),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Question request failed",
      });
    }
  });
});
