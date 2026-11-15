import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "./useCurrentUser.js";
import { useLogin } from "./useLogin.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLogin", () => {
  it("logs in with same-origin credentials and invalidates auth queries", async () => {
    const responseBody = {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Ada Student",
      email: "ada@example.test",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(currentUserQueryKey, { id: "cached-user" });
    queryClient.setQueryData(
      ["admin", "teacher-applications", "cached-user", "list", {}],
      { items: ["cached-administrator-data"] },
    );

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });

    let loginResult: unknown;
    await act(async () => {
      loginResult = await result.current.mutateAsync({
        email: "ada@example.test",
        password: "a synthetic test passphrase",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          email: "ada@example.test",
          password: "a synthetic test passphrase",
        }),
      }),
    );
    expect(loginResult).toEqual(responseBody);
    expect(queryClient.getQueryData(currentUserQueryKey)).toBeNull();
    expect(
      queryClient.getQueryData([
        "admin",
        "teacher-applications",
        "cached-user",
        "list",
        {},
      ]),
    ).toBeUndefined();
    expect(queryClient.getQueryState(currentUserQueryKey)?.isInvalidated).toBe(
      true,
    );
  });
});
