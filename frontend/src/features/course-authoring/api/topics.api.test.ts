import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherTopic,
  getTeacherTopic,
  listTeacherTopics,
  reorderTeacherTopics,
  updateTeacherTopic,
} from "./topics.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const topic = {
  id: topicId,
  courseId,
  title: "Linear equations",
  description: "An introduction to equations.",
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

describe("topic API client", () => {
  it("creates, lists, retrieves, and updates topics through the typed Fetch client", async () => {
    const topicList = { items: [topic] };
    const fetchMock = stubJsonResponses(
      { body: topic, status: 201 },
      { body: topicList },
      { body: topic },
      { body: { ...topic, title: "Updated equations" } },
    );

    await expect(
      createTeacherTopic(courseId, {
        title: "  Linear equations  ",
        description: "  An introduction to equations.  ",
      }),
    ).resolves.toEqual(topic);
    await expect(listTeacherTopics(courseId)).resolves.toEqual(topicList);
    await expect(getTeacherTopic(courseId, topicId)).resolves.toEqual(topic);
    await expect(
      updateTeacherTopic(courseId, topicId, { title: "Updated equations" }),
    ).resolves.toEqual({ ...topic, title: "Updated equations" });

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      [`/api/v1/teacher/courses/${courseId}/topics`, "POST"],
      [`/api/v1/teacher/courses/${courseId}/topics`, "GET"],
      [`/api/v1/teacher/courses/${courseId}/topics/${topicId}`, "GET"],
      [`/api/v1/teacher/courses/${courseId}/topics/${topicId}`, "PATCH"],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      body: JSON.stringify({
        title: "Linear equations",
        description: "An introduction to equations.",
      }),
    });
  });

  it("reorders the complete topic list using the existing endpoint", async () => {
    const topicList = { items: [topic] };
    const fetchMock = stubJsonResponses({ body: topicList });

    await expect(
      reorderTeacherTopics(courseId, { topicIds: [topicId] }),
    ).resolves.toEqual(topicList);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/order`,
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        body: JSON.stringify({ topicIds: [topicId] }),
      }),
    );
  });

  it("rejects invalid UUIDs, request fields, and duplicate order IDs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(listTeacherTopics("invalid-id")).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      createTeacherTopic(courseId, { title: " " }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      updateTeacherTopic(courseId, topicId, { position: 2 } as never),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      reorderTeacherTopics(courseId, { topicIds: [topicId, topicId] }),
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
              title: "Topic request failed",
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

      await expect(getTeacherTopic(courseId, topicId)).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Topic request failed",
      });
    },
  );

  it("rejects response data that does not match the shared contract", async () => {
    stubJsonResponses({ body: { id: "not-a-uuid" } });

    await expect(getTeacherTopic(courseId, topicId)).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});
