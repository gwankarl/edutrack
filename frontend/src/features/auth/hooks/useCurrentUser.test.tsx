import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "./auth-query-keys.js";
import { useLogin } from "./useLogin.js";
import { useCurrentUser } from "./useCurrentUser.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

describe("useCurrentUser", () => {
  it("tracks loading then authenticated state from the shared response", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: Wrapper,
    });

    expect(result.current.status).toBe("loading");

    resolveFetch(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          displayName: "Ada Student",
          email: "ada@example.test",
          emailVerified: true,
          accountStatus: "active",
          roles: ["student"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });

    expect(result.current.user?.email).toBe("ada@example.test");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("treats HTTP 401 as unauthenticated without exposing it as a query error", async () => {
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

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clears an authenticated user when a refreshed session request returns 401", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(currentUserQueryKey, {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Ada Student",
      email: "ada@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Authentication required",
          status: 401,
          detail: "The session is expired or invalid.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: Wrapper,
    });
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

    await waitFor(() => {
      expect(result.current.status).toBe("unauthenticated");
    });

    expect(result.current.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("reports other API failures as an error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("does not expose cached user data after a current-user refresh fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(currentUserQueryKey, {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Ada Student",
      email: "ada@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: Wrapper,
    });
    await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.user).toBeNull();
  });

  it.each([
    { previousRoles: ["student"], refreshedRoles: ["student", "teacher"] },
    { previousRoles: ["student", "teacher"], refreshedRoles: ["student"] },
  ])(
    "uses refreshed backend roles instead of cached roles ($previousRoles -> $refreshedRoles)",
    async ({ previousRoles, refreshedRoles }) => {
      const userId = "00000000-0000-4000-8000-000000000001";
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(currentUserQueryKey, {
        id: userId,
        displayName: "Ada Student",
        email: "ada@example.test",
        emailVerified: true,
        accountStatus: "active",
        roles: previousRoles,
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              id: userId,
              displayName: "Ada Student",
              email: "ada@example.test",
              emailVerified: true,
              accountStatus: "active",
              roles: refreshedRoles,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      );

      function Wrapper({ children }: PropsWithChildren) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      }

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: Wrapper,
      });
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

      await waitFor(() => {
        expect(result.current.status).toBe("authenticated");
      });
      expect(
        result.current.status === "authenticated"
          ? result.current.user.roles
          : [],
      ).toEqual(refreshedRoles);
    },
  );

  it("keeps navigation in a loading state while login replaces cached user data", async () => {
    let resolveLogin!: (response: Response) => void;
    let userRequestCount = 0;
    const currentUserResponse = {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: "Ada Student",
      email: "ada@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: ["student"],
    };
    const loginResponse = {
      id: currentUserResponse.id,
      displayName: currentUserResponse.displayName,
      email: currentUserResponse.email,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/v1/auth/me") {
        userRequestCount += 1;

        if (userRequestCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ title: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/problem+json" },
            }),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify(currentUserResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(
      () => ({ currentUser: useCurrentUser(), login: useLogin() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.currentUser.status).toBe("unauthenticated");
    });

    result.current.login.mutate({
      email: "ada@example.test",
      password: "a synthetic test passphrase",
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(result.current.currentUser.status).toBe("loading");

    resolveLogin(
      new Response(JSON.stringify(loginResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => {
      expect(result.current.currentUser.status).toBe("authenticated");
    });
  });
});
