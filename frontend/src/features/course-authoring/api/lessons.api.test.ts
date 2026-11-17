import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherLesson,
  getTeacherLesson,
  listTeacherLessons,
  reorderTeacherLessons,
  updateTeacherLesson,
} from "./lessons.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const lessonId = "550e8400-e29b-41d4-a716-446655440022";
const lesson = {
  id: lessonId,
  topicId,
  title: "Solving an equation",
  content: { type: "text", text: "Isolate the unknown." },
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

function stubJsonResponses(...responses: Array<{ body: unknown; status?: number }>) {
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

describe("lesson API client", () => {
  it("creates, lists, retrieves, and updates lessons through the typed Fetch client", async () => {
    const collectionPath = `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons`;
    const lessonList = { items: [lesson] };
    const fetchMock = stubJsonResponses(
      { body: lesson, status: 201 },
      { body: lessonList },
      { body: lesson },
      { body: { ...lesson, content: null } },
    );

    await expect(
      createTeacherLesson(courseId, topicId, {
        title: " Solving an equation ",
        content: lesson.content,
      }),
    ).resolves.toEqual(lesson);
    await expect(listTeacherLessons(courseId, topicId)).resolves.toEqual(
      lessonList,
    );
    await expect(getTeacherLesson(courseId, topicId, lessonId)).resolves.toEqual(
      lesson,
    );
    await expect(
      updateTeacherLesson(courseId, topicId, lessonId, { content: null }),
    ).resolves.toEqual({ ...lesson, content: null });

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      [collectionPath, "POST"],
      [collectionPath, "GET"],
      [`${collectionPath}/${lessonId}`, "GET"],
      [`${collectionPath}/${lessonId}`, "PATCH"],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      body: JSON.stringify({ title: "Solving an equation", content: lesson.content }),
    });
  });

  it("reorders the complete lesson list using the existing endpoint", async () => {
    const lessonList = { items: [lesson] };
    const fetchMock = stubJsonResponses({ body: lessonList });

    await expect(
      reorderTeacherLessons(courseId, topicId, { lessonIds: [lessonId] }),
    ).resolves.toEqual(lessonList);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons/order`,
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        body: JSON.stringify({ lessonIds: [lessonId] }),
      }),
    );
  });

  it("rejects invalid UUIDs, request fields, and duplicate order IDs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listTeacherLessons(courseId, "invalid-id"),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      createTeacherLesson(courseId, topicId, { title: " " }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      updateTeacherLesson(courseId, topicId, lessonId, { position: 2 } as never),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      reorderTeacherLessons(courseId, topicId, {
        lessonIds: [lessonId, lessonId],
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 409, 500])(
    "preserves standardized HTTP %i errors from the shared client",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              title: "Lesson request failed",
              status,
              detail: "The request could not be completed.",
            }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(
        getTeacherLesson(courseId, topicId, lessonId),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Lesson request failed",
      });
    },
  );

  it("rejects response data that does not match the shared contract", async () => {
    stubJsonResponses({ body: { id: "not-a-uuid" } });

    await expect(
      getTeacherLesson(courseId, topicId, lessonId),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});
