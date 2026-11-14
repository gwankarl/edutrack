import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { myTeacherApplicationQueryKey } from "./useMyTeacherApplication.js";
import { useSubmitTeacherApplication } from "./useSubmitTeacherApplication.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const userId = "550e8400-e29b-41d4-a716-446655440001";
const currentUser = {
  id: userId,
  displayName: "Synthetic Applicant",
  email: "applicant@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student"] as const,
};
const request = {
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
};
const application = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  status: "pending" as const,
  ...request,
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
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

describe("useSubmitTeacherApplication", () => {
  it("submits with same-origin credentials and updates the current user's query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(application), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubmitTeacherApplication(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(request);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher-applications",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(request),
      }),
    );
    expect(
      queryClient.getQueryData(myTeacherApplicationQueryKey(userId)),
    ).toEqual({ application });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("does not submit when the current user is unauthenticated", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    queryClient.setQueryData(currentUserQueryKey, null);

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useSubmitTeacherApplication(), {
      wrapper: Wrapper,
    });

    await expect(result.current.mutateAsync(request)).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes duplicate-submission conflicts as ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Application already pending",
            status: 409,
            detail: "A pending teacher application already exists.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSubmitTeacherApplication(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync(request)).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
