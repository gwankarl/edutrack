import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherQuiz,
  getTeacherQuiz,
  listTeacherQuizzes,
  reorderTeacherQuizzes,
  updateTeacherQuiz,
} from "./quizzes.api.js";

afterEach(() => vi.unstubAllGlobals());

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizId = "550e8400-e29b-41d4-a716-446655440022";

const quiz = {
  id: quizId,
  topicId,
  title: "Algebra review",
  description: "Practice equations",
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
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

describe("quiz API client", () => {
  it("creates, lists, retrieves, updates, and reorders quizzes using backend paths", async () => {
    const list = { items: [quiz] };
    const fetchMock = stubResponses(
      { body: quiz, status: 201 },
      { body: list },
      { body: quiz },
      { body: { ...quiz, title: "Updated review" } },
      { body: list },
    );

    await expect(
      createTeacherQuiz(courseId, topicId, {
        title: "  Algebra review  ",
        description: "  Practice equations  ",
      }),
    ).resolves.toEqual(quiz);
    await expect(listTeacherQuizzes(courseId, topicId)).resolves.toEqual(list);
    await expect(getTeacherQuiz(courseId, topicId, quizId)).resolves.toEqual(
      quiz,
    );
    await expect(
      updateTeacherQuiz(courseId, topicId, quizId, {
        title: "Updated review",
      }),
    ).resolves.toEqual({ ...quiz, title: "Updated review" });
    await expect(
      reorderTeacherQuizzes(courseId, topicId, { quizIds: [quizId] }),
    ).resolves.toEqual(list);

    expect(
      fetchMock.mock.calls.map(([url, options]) => [url, options?.method]),
    ).toEqual([
      [`/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes`, "POST"],
      [
        `/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes`,
        "GET",
      ],
      [
        `/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
        "GET",
      ],
      [
        `/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
        "PATCH",
      ],
      [
        `/api/v1/teacher/courses/${courseId}/topics/${topicId}/quizzes/order`,
        "PUT",
      ],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      body: JSON.stringify({
        title: "Algebra review",
        description: "Practice equations",
      }),
    });
  });

  it("validates IDs and requests before fetching and rejects malformed responses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listTeacherQuizzes("bad", topicId)).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      createTeacherQuiz(courseId, topicId, { title: " " }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      reorderTeacherQuizzes(courseId, topicId, {
        quizIds: [quizId, quizId],
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();

    stubResponses({ body: { id: "not-a-uuid" } });
    await expect(
      getTeacherQuiz(courseId, topicId, quizId),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });

  it.each([400, 401, 403, 404, 409, 500])(
    "preserves backend HTTP %i errors",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ title: "Quiz request failed", status }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(
        getTeacherQuiz(courseId, topicId, quizId),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Quiz request failed",
      });
    },
  );
});
