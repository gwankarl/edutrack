import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { currentUserQueryKey } from "../../../auth/hooks/auth-query-keys.js";
import { myTeacherApplicationQueryKey } from "../../../teacher-applications/hooks/useMyTeacherApplication.js";
import { adminTeacherApplicationQueryKeys } from "./useTeacherApplications.js";
import { useTeacherApplicationDecision } from "./useTeacherApplicationDecision.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const administratorId = "550e8400-e29b-41d4-a716-446655440001";
const applicationId = "550e8400-e29b-41d4-a716-446655440002";
const reviewer = {
  id: administratorId,
  displayName: "Synthetic Administrator",
  email: "administrator@example.test",
};
const administrator = {
  ...reviewer,
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "administrator"],
};
const approvedResponse = {
  applicationId,
  status: "approved" as const,
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer,
};
const decision = {
  decision: "approve" as const,
  applicationId,
  input: { reviewNotes: "Reviewed and approved." },
};

function createWrapper(currentUser: unknown) {
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

describe("useTeacherApplicationDecision", () => {
  it("approves an application and invalidates related caches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(approvedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const filters = { status: "pending" as const, page: 1, pageSize: 20 };
    const { queryClient, Wrapper } = createWrapper(administrator);
    const listKey = adminTeacherApplicationQueryKeys.list(
      administratorId,
      filters,
    );
    const detailKey = adminTeacherApplicationQueryKeys.detail(
      administratorId,
      applicationId,
    );
    const applicantKey = myTeacherApplicationQueryKey(administratorId);
    queryClient.setQueryData(listKey, { items: [] });
    queryClient.setQueryData(detailKey, { id: applicationId });
    queryClient.setQueryData(applicantKey, { application: null });

    const { result } = renderHook(() => useTeacherApplicationDecision(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(result.current.submitDecision(decision)).resolves.toEqual(
        approvedResponse,
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications/" + applicationId + "/approve",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ reviewNotes: "Reviewed and approved." }),
      }),
    );
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(applicantKey)?.isInvalidated).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("submits rejection with its required reason", async () => {
    const rejectedResponse = {
      ...approvedResponse,
      status: "rejected" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rejectedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(administrator);
    const { result } = renderHook(() => useTeacherApplicationDecision(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.submitDecision({
        decision: "reject",
        applicationId,
        input: { rejectionReason: "Please add relevant experience." },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications/" + applicationId + "/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          rejectionReason: "Please add relevant experience.",
        }),
      }),
    );
  });

  it("does not send a request for an unauthenticated or non-Administrator user", async () => {
    for (const user of [
      null,
      { ...administrator, roles: ["student", "teacher"] },
    ]) {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { Wrapper } = createWrapper(user);
      const { result } = renderHook(() => useTeacherApplicationDecision(), {
        wrapper: Wrapper,
      });

      await expect(
        result.current.submitDecision(decision),
      ).rejects.toMatchObject({
        name: "ApiError",
        status: user === null ? 401 : 403,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });

  it("rejects an invalid application ID without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(administrator);
    const { result } = renderHook(() => useTeacherApplicationDecision(), {
      wrapper: Wrapper,
    });

    await expect(
      result.current.submitDecision({
        ...decision,
        applicationId: "invalid-id",
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents a second decision request while one is pending", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(administrator);
    const { result } = renderHook(() => useTeacherApplicationDecision(), {
      wrapper: Wrapper,
    });

    let firstRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current.submitDecision(decision);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await expect(result.current.submitDecision(decision)).rejects.toMatchObject(
      {
        name: "ApiError",
        status: 409,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest(
      new Response(JSON.stringify(approvedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await act(async () => {
      await firstRequest;
    });
  });

  it("exposes API conflicts and server errors to the mutation caller", async () => {
    for (const status of [409, 500]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              title: "Application already reviewed",
              status,
              detail: "The application is no longer pending.",
            }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      const { Wrapper } = createWrapper(administrator);
      const { result } = renderHook(() => useTeacherApplicationDecision(), {
        wrapper: Wrapper,
      });

      await expect(
        result.current.submitDecision(decision),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      vi.unstubAllGlobals();
    }
  });
});
