import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { teacherDashboardSummaryQueryKeys } from "./teacher-dashboard-query-keys.js";
import { useTeacherDashboardSummary } from "./useTeacherDashboardSummary.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const userId = "550e8400-e29b-41d4-a716-446655440030";

const teacher = {
  id: userId,
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "teacher"],
} as const;

const summary = {
  statusCounts: {
    total: 2,
    draft: 2,
    pendingReview: 0,
    published: 0,
    rejected: 0,
  },
  recentDraftCourses: [
    {
      id: "550e8400-e29b-41d4-a716-446655440020",
      title: "Draft in backend order",
      status: "draft",
      updatedAt: "2026-11-16T10:00:00.000Z",
    },
  ],
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

describe("useTeacherDashboardSummary", () => {
  it("loads summary data for the authenticated Teacher and uses a user-scoped key", async () => {
    const fetchMock = stubJsonResponse(summary);
    const { queryClient, Wrapper } = createWrapper(teacher);

    const { result } = renderHook(() => useTeacherDashboardSummary(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.authorizationStatus).toBe("authorized");
    expect(result.current.data).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/dashboard/summary",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(
      queryClient.getQueryData(
        teacherDashboardSummaryQueryKeys.forUser(userId),
      ),
    ).toEqual(summary);
    expect(teacherDashboardSummaryQueryKeys.forUser(userId)).not.toEqual(
      teacherDashboardSummaryQueryKeys.forUser(
        "550e8400-e29b-41d4-a716-446655440099",
      ),
    );
  });

  it.each([
    ["unauthenticated", null, "unauthenticated"],
    ["non-Teacher", { ...teacher, roles: ["student"] }, "forbidden"],
    [
      "inactive Teacher",
      { ...teacher, accountStatus: "suspended" },
      "forbidden",
    ],
  ])("does not request data for a %s session", (_label, user, accessStatus) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = createWrapper(user);

    const { result } = renderHook(() => useTeacherDashboardSummary(), {
      wrapper: Wrapper,
    });

    expect(result.current.authorizationStatus).toBe(accessStatus);
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes API failures through query error state", async () => {
    const fetchMock = stubJsonResponse(
      {
        title: "Service unavailable",
        status: 503,
        detail: "Please try again later.",
      },
      503,
    );
    const { Wrapper } = createWrapper(teacher);

    const { result } = renderHook(() => useTeacherDashboardSummary(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5_000,
    });

    expect(result.current.authorizationStatus).toBe("authorized");
    expect(result.current.error).toMatchObject({
      name: "ApiError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses fresh cached data instead of issuing a duplicate request", async () => {
    const fetchMock = stubJsonResponse(summary);
    const { Wrapper } = createWrapper(teacher);

    const first = renderHook(() => useTeacherDashboardSummary(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useTeacherDashboardSummary(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
