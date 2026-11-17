import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { teacherDashboardSummaryQueryKeys } from "../../teachers/hooks/teacher-dashboard-query-keys.js";
import { useCreateCourse } from "./useCreateCourse.js";
import { useTeacherCourse } from "./useTeacherCourse.js";
import {
  teacherCourseQueryKeys,
  useTeacherCourses,
} from "./useTeacherCourses.js";
import { useUpdateCourse } from "./useUpdateCourse.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const userId = "550e8400-e29b-41d4-a716-446655440030";
const courseId = "550e8400-e29b-41d4-a716-446655440020";

const teacher = {
  id: userId,
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "teacher"],
};

const course = {
  id: courseId,
  title: "Introduction to Algebra",
  description: "An introduction to algebra.",
  academicLevel: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: "550e8400-e29b-41d4-a716-446655440010",
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft" as const,
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

function stubJsonResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useTeacherCourses", () => {
  it("fetches filtered courses and scopes the cache to the authenticated Teacher", async () => {
    const response = {
      items: [course],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      },
    };
    const fetchMock = stubJsonResponse(response);
    const { queryClient, Wrapper } = createWrapper(teacher);
    const filters = {
      status: "draft" as const,
      sort: "updated_desc" as const,
      page: 2,
      pageSize: 10,
    };

    const { result } = renderHook(() => useTeacherCourses(filters), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.authorizationStatus).toBe("authorized");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses?page=2&pageSize=10&status=draft",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(
      queryClient.getQueryData(teacherCourseQueryKeys.list(userId, filters)),
    ).toEqual(response);
    expect(
      teacherCourseQueryKeys.list(
        "550e8400-e29b-41d4-a716-446655440099",
        filters,
      ),
    ).not.toEqual(teacherCourseQueryKeys.list(userId, filters));
  });

  it("includes search and sort in the request and teacher-scoped query key", async () => {
    const response = {
      items: [course],
      pagination: {
        page: 2,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
      },
    };
    const fetchMock = stubJsonResponse(response);
    const { queryClient, Wrapper } = createWrapper(teacher);
    const filters = {
      search: "Algebra",
      status: "draft" as const,
      sort: "title_asc" as const,
      page: 2,
      pageSize: 10,
    };

    const { result } = renderHook(() => useTeacherCourses(filters), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses?page=2&pageSize=10&status=draft&search=Algebra&sort=title_asc",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(
      queryClient.getQueryData(teacherCourseQueryKeys.list(userId, filters)),
    ).toEqual(response);
    expect(
      teacherCourseQueryKeys.list("another-user", filters),
    ).not.toEqual(teacherCourseQueryKeys.list(userId, filters));
  });

  it.each([
    ["unauthenticated", null, "unauthenticated"],
    ["non-Teacher", { ...teacher, roles: ["student"] }, "forbidden"],
    [
      "inactive Teacher",
      { ...teacher, accountStatus: "suspended" },
      "forbidden",
    ],
  ])("does not fetch for a %s session", async (_label, user, accessStatus) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = createWrapper(user);

    const { result } = renderHook(() => useTeacherCourses(), {
      wrapper: Wrapper,
    });

    expect(result.current.authorizationStatus).toBe(accessStatus);
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useTeacherCourse", () => {
  it("loads a valid course for a Teacher", async () => {
    const fetchMock = stubJsonResponse(course);
    const { Wrapper } = createWrapper(teacher);
    const { result } = renderHook(() => useTeacherCourse(courseId), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(course);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("does not request an invalid course ID", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = createWrapper(teacher);
    const { result } = renderHook(() => useTeacherCourse("not-a-uuid"), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.validationError).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("course mutations", () => {
  it("creates a course, caches its detail, and invalidates the Teacher's list", async () => {
    const fetchMock = stubJsonResponse(course, 201);
    const { queryClient, Wrapper } = createWrapper(teacher);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const dashboardKey = teacherDashboardSummaryQueryKeys.forUser(userId);
    queryClient.setQueryData(dashboardKey, { cached: "dashboard-summary" });
    const { result } = renderHook(() => useCreateCourse(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        title: course.title,
        description: course.description ?? undefined,
        academicLevelId: course.academicLevel.id,
        subjectId: course.subject.id,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    );
    expect(
      queryClient.getQueryData(teacherCourseQueryKeys.detail(userId, courseId)),
    ).toEqual(course);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: teacherCourseQueryKeys.lists(userId),
    });
    expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("updates a course and refreshes the Teacher's list cache", async () => {
    const fetchMock = stubJsonResponse(course);
    const { queryClient, Wrapper } = createWrapper(teacher);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const dashboardKey = teacherDashboardSummaryQueryKeys.forUser(userId);
    queryClient.setQueryData(dashboardKey, { cached: "dashboard-summary" });
    const { result } = renderHook(() => useUpdateCourse(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        courseId,
        input: { title: "Updated title" },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
      }),
    );
    expect(
      queryClient.getQueryData(teacherCourseQueryKeys.detail(userId, courseId)),
    ).toEqual(course);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: teacherCourseQueryKeys.lists(userId),
    });
    expect(queryClient.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("prevents mutations without an authenticated Teacher session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = createWrapper(null);
    const { result } = renderHook(() => useCreateCourse(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          title: course.title,
          academicLevelId: course.academicLevel.id,
          subjectId: course.subject.id,
        }),
      ).rejects.toMatchObject({ status: 401 });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a non-Draft conflict in mutation state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Course cannot be edited",
            status: 409,
            detail: "Only draft courses can be updated.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );
    const { Wrapper } = createWrapper(teacher);
    const { result } = renderHook(() => useUpdateCourse(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          courseId,
          input: { title: "Updated title" },
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
