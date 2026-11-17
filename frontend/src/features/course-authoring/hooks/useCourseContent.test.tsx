import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useLesson } from "./useLesson.js";
import { useTopic } from "./useTopic.js";
import { useCourseTopics } from "./useCourseTopics.js";
import { useTopicLessons } from "./useTopicLessons.js";
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
  roles: ["student", "teacher"],
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

const lesson = {
  id: lessonId,
  topicId,
  title: "Solve for x",
  content: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

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

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("course content query hooks", () => {
  it("loads topics and nested topic/lesson details for an active Teacher", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/courses/${courseId}/topics`)) {
        return Promise.resolve(response({ items: [topic] }));
      }
      if (url.endsWith(`/courses/${courseId}/topics/${topicId}/lessons`)) {
        return Promise.resolve(response({ items: [lesson] }));
      }
      if (url.endsWith(`/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`)) {
        return Promise.resolve(response(lesson));
      }
      return Promise.resolve(response(topic));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { queryClient, Wrapper } = createWrapper(teacher);

    const topicList = renderHook(() => useCourseTopics(courseId), {
      wrapper: Wrapper,
    });
    const topicDetail = renderHook(() => useTopic(courseId, topicId), {
      wrapper: Wrapper,
    });
    const lessonList = renderHook(() => useTopicLessons(courseId, topicId), {
      wrapper: Wrapper,
    });
    const lessonDetail = renderHook(
      () => useLesson(courseId, topicId, lessonId),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(topicList.result.current.isSuccess).toBe(true);
      expect(topicDetail.result.current.isSuccess).toBe(true);
      expect(lessonList.result.current.isSuccess).toBe(true);
      expect(lessonDetail.result.current.isSuccess).toBe(true);
    });

    expect(topicList.result.current.data).toEqual({ items: [topic] });
    expect(topicDetail.result.current.data).toEqual(topic);
    expect(lessonList.result.current.data).toEqual({ items: [lesson] });
    expect(lessonDetail.result.current.data).toEqual(lesson);
    expect(topicList.result.current.authorizationStatus).toBe("authorized");
    expect(
      queryClient.getQueryData(
        courseContentQueryKeys.lesson(userId, courseId, topicId, lessonId),
      ),
    ).toEqual(lesson);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("does not fetch when the session lacks Teacher access or route IDs are invalid", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper: studentWrapper } = createWrapper({
      ...teacher,
      roles: ["student"],
    });
    const denied = renderHook(() => useCourseTopics(courseId), {
      wrapper: studentWrapper,
    });

    expect(denied.result.current.authorizationStatus).toBe("forbidden");
    expect(denied.result.current.fetchStatus).toBe("idle");

    const { Wrapper: teacherWrapper } = createWrapper(teacher);
    const invalid = renderHook(() => useLesson("bad-id", topicId, lessonId), {
      wrapper: teacherWrapper,
    });

    expect(invalid.result.current.authorizationStatus).toBe("authorized");
    expect(invalid.result.current.validationError).not.toBeNull();
    expect(invalid.result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps otherwise identical topic caches isolated by authenticated user", () => {
    expect(
      courseContentQueryKeys.topic(userId, courseId, topicId),
    ).not.toEqual(
      courseContentQueryKeys.topic(
        "550e8400-e29b-41d4-a716-446655440098",
        courseId,
        topicId,
      ),
    );
  });
});
