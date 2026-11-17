import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import {
  useReorderCourseTopics,
  useReorderTopicLessons,
} from "./useContentReordering.js";
import { useCreateLesson, useUpdateLesson } from "./useLessonMutations.js";
import { useCreateTopic, useUpdateTopic } from "./useTopicMutations.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const lessonId = "550e8400-e29b-41d4-a716-446655440022";
const userId = "550e8400-e29b-41d4-a716-446655440099";

const teacher = {
  id: userId,
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["teacher"],
};

const topic = {
  id: topicId,
  courseId,
  title: "Linear equations",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

const updatedTopic = { ...topic, title: "Updated equations" };
const lesson = {
  id: lessonId,
  topicId,
  title: "Solve for x",
  content: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};
const updatedLesson = { ...lesson, title: "Updated lesson" };

function createWrapper(currentUser: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(currentUserQueryKey, currentUser);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("topic and lesson mutation hooks", () => {
  it("updates detail/list caches after create, update, and reorder mutations", async () => {
    const reorderedTopics = { items: [updatedTopic] };
    const reorderedLessons = { items: [updatedLesson] };
    const fetchMock = vi.fn();
    [
      { body: topic, status: 201 },
      { body: updatedTopic },
      { body: reorderedTopics },
      { body: lesson, status: 201 },
      { body: updatedLesson },
      { body: reorderedLessons },
    ].forEach(({ body, status }) => {
      fetchMock.mockResolvedValueOnce(jsonResponse(body, status));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, Wrapper } = createWrapper(teacher);
    const topicListKey = courseContentQueryKeys.topicList(userId, courseId);
    const lessonListKey = courseContentQueryKeys.lessonList(
      userId,
      courseId,
      topicId,
    );
    queryClient.setQueryData(topicListKey, { items: [] });
    queryClient.setQueryData(lessonListKey, { items: [] });

    const createTopic = renderHook(() => useCreateTopic(courseId), {
      wrapper: Wrapper,
    });
    const updateTopic = renderHook(() => useUpdateTopic(courseId, topicId), {
      wrapper: Wrapper,
    });
    const reorderTopics = renderHook(
      () => useReorderCourseTopics(courseId),
      { wrapper: Wrapper },
    );
    const createLesson = renderHook(
      () => useCreateLesson(courseId, topicId),
      { wrapper: Wrapper },
    );
    const updateLesson = renderHook(
      () => useUpdateLesson(courseId, topicId, lessonId),
      { wrapper: Wrapper },
    );
    const reorderLessons = renderHook(
      () => useReorderTopicLessons(courseId, topicId),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await createTopic.result.current.mutateAsync({ title: topic.title });
      await updateTopic.result.current.mutateAsync({
        input: { title: updatedTopic.title },
      });
      await reorderTopics.result.current.mutateAsync({ topicIds: [topicId] });
      await createLesson.result.current.mutateAsync({ title: lesson.title });
      await updateLesson.result.current.mutateAsync({
        input: { title: updatedLesson.title },
      });
      await reorderLessons.result.current.mutateAsync({
        lessonIds: [lessonId],
      });
    });

    await waitFor(() => {
      expect(createTopic.result.current.isSuccess).toBe(true);
      expect(updateTopic.result.current.isSuccess).toBe(true);
      expect(reorderTopics.result.current.isSuccess).toBe(true);
      expect(createLesson.result.current.isSuccess).toBe(true);
      expect(updateLesson.result.current.isSuccess).toBe(true);
      expect(reorderLessons.result.current.isSuccess).toBe(true);
    });

    expect(
      queryClient.getQueryData(
        courseContentQueryKeys.topic(userId, courseId, topicId),
      ),
    ).toEqual(updatedTopic);
    expect(queryClient.getQueryData(topicListKey)).toEqual(reorderedTopics);
    expect(queryClient.getQueryData(lessonListKey)).toEqual(reorderedLessons);
    expect(
      queryClient.getQueryData(
        courseContentQueryKeys.lesson(userId, courseId, topicId, lessonId),
      ),
    ).toEqual(updatedLesson);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "PATCH",
      "PUT",
      "POST",
      "PATCH",
      "PUT",
    ]);
  });

  it("rejects mutation attempts without an authenticated Teacher before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = createWrapper(null);
    const { result } = renderHook(() => useCreateTopic(courseId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ title: "A topic" }),
      ).rejects.toMatchObject({ status: 401 });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes the cached topic order after a failed reorder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ title: "Conflict", status: 409 }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, Wrapper } = createWrapper(teacher);
    const topicListKey = courseContentQueryKeys.topicList(userId, courseId);
    const originalList = { items: [topic] };
    queryClient.setQueryData(topicListKey, originalList);
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const reorder = renderHook(() => useReorderCourseTopics(courseId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        reorder.result.current.mutateAsync({ topicIds: [topicId] }),
      ).rejects.toMatchObject({ status: 409 });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: topicListKey,
    });
    expect(queryClient.getQueryData(topicListKey)).toEqual(originalList);
  });

  it("refreshes the cached lesson order after a failed reorder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ title: "Conflict", status: 409 }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, Wrapper } = createWrapper(teacher);
    const lessonListKey = courseContentQueryKeys.lessonList(
      userId,
      courseId,
      topicId,
    );
    const originalList = { items: [lesson] };
    queryClient.setQueryData(lessonListKey, originalList);
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const reorder = renderHook(
      () => useReorderTopicLessons(courseId, topicId),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(
        reorder.result.current.mutateAsync({ lessonIds: [lessonId] }),
      ).rejects.toMatchObject({ status: 409 });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: lessonListKey,
    });
    expect(queryClient.getQueryData(lessonListKey)).toEqual(originalList);
  });
});
