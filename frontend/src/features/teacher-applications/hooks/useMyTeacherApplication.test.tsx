import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useMyTeacherApplication } from "./useMyTeacherApplication.js";
import { myTeacherApplicationQueryKey } from "./useMyTeacherApplication.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const applicationA = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  status: "pending" as const,
  motivation: "Application belonging to user A.",
  qualifications: "Synthetic qualifications.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

function createWrapper(currentUser: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
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

describe("useMyTeacherApplication", () => {
  it("does not request an application when unauthenticated", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(null);
    const { result } = renderHook(() => useMyTeacherApplication(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.authStatus).toBe("unauthenticated");
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the authenticated user's application", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440001";
    const currentUser = {
      id: userId,
      displayName: "Synthetic Applicant",
      email: "applicant@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    };
    const responseBody = { application: applicationA };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(currentUser);
    const { result } = renderHook(() => useMyTeacherApplication(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.authStatus).toBe("authenticated");
    expect(result.current.data).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher-applications/me",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("uses a different cache key for each authenticated user", async () => {
    const userAId = "550e8400-e29b-41d4-a716-446655440001";
    const userBId = "550e8400-e29b-41d4-a716-446655440003";
    const currentUserB = {
      id: userBId,
      displayName: "Synthetic User B",
      email: "user-b@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    };
    const applicationB = {
      ...applicationA,
      id: "550e8400-e29b-41d4-a716-446655440011",
      motivation: "Application belonging to user B.",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ application: applicationB }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, Wrapper } = createWrapper(currentUserB);
    queryClient.setQueryData(myTeacherApplicationQueryKey(userAId), {
      application: applicationA,
    });

    const { result } = renderHook(() => useMyTeacherApplication(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ application: applicationB });
    expect(result.current.data).not.toEqual({ application: applicationA });
  });

  it("exposes authentication errors without returning application data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Authentication required",
            status: 401,
            detail: "A valid session is required.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    const userId = "550e8400-e29b-41d4-a716-446655440001";
    const currentUser = {
      id: userId,
      displayName: "Synthetic Applicant",
      email: "applicant@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    };
    const { Wrapper } = createWrapper(currentUser);
    const { result } = renderHook(() => useMyTeacherApplication(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.data).toBeUndefined();
  });
});
