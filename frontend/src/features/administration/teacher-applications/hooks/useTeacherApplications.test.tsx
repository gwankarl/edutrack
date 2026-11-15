import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../../auth/hooks/auth-query-keys.js";
import {
  adminTeacherApplicationQueryKeys,
  useTeacherApplications,
} from "./useTeacherApplications.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const administratorId = "550e8400-e29b-41d4-a716-446655440001";
const administrator = {
  id: administratorId,
  displayName: "Synthetic Administrator",
  email: "administrator@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "administrator"],
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

describe("useTeacherApplications", () => {
  it("fetches a filtered page and scopes its cache key to the Administrator", async () => {
    const response = {
      items: [],
      pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const filters = { status: "pending" as const, page: 2, pageSize: 10 };
    const { queryClient, Wrapper } = createWrapper(administrator);
    const { result } = renderHook(() => useTeacherApplications(filters), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.authorizationStatus).toBe("authorized");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/teacher-applications?page=2&pageSize=10&status=pending",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(
      queryClient.getQueryData(
        adminTeacherApplicationQueryKeys.list(administratorId, filters),
      ),
    ).toEqual(response);
    expect(
      adminTeacherApplicationQueryKeys.list(
        "550e8400-e29b-41d4-a716-446655440099",
        filters,
      ),
    ).not.toEqual(
      adminTeacherApplicationQueryKeys.list(administratorId, filters),
    );
  });

  it.each([
    ["unauthenticated", null, "unauthenticated"],
    [
      "non-administrator",
      { ...administrator, roles: ["student"] },
      "forbidden",
    ],
  ])("does not fetch for a %s session", async (_label, user, accessStatus) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper(user);
    const { result } = renderHook(() => useTeacherApplications(), {
      wrapper: Wrapper,
    });

    expect(result.current.authorizationStatus).toBe(accessStatus);
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
