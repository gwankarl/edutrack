import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CurrentUserRole } from "@edutrack/contracts";

import RoleGuard from "./RoleGuard.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeUser(roles: CurrentUserRole[]) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Ada Learner",
    email: "ada@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles,
  };
}

function LoginDestination() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;

  return <p>Login destination: {state?.from ?? "none"}</p>;
}

function renderRoleRoute(roles: CurrentUserRole[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginDestination /> },
      {
        element: <RoleGuard allowedRoles={roles} />,
        children: [{ path: "/role-area", element: <p>Role-protected page</p> }],
      },
    ],
    { initialEntries: ["/role-area"] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient, router };
}

function respondWithUser(roles: CurrentUserRole[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeUser(roles)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("RoleGuard", () => {
  it("allows a user with one of the required roles", async () => {
    respondWithUser(["teacher"]);

    renderRoleRoute(["teacher", "administrator"]);

    expect(await screen.findByText("Role-protected page")).toBeTruthy();
  });

  it("supports multi-role users when any assigned role is allowed", async () => {
    respondWithUser(["student", "teacher"]);

    renderRoleRoute(["teacher"]);

    expect(await screen.findByText("Role-protected page")).toBeTruthy();
  });

  it("allows an administrator when the route policy explicitly permits it", async () => {
    respondWithUser(["administrator"]);

    renderRoleRoute(["administrator"]);

    expect(await screen.findByText("Role-protected page")).toBeTruthy();
  });

  it("shows accessible access denied feedback when no role matches", async () => {
    respondWithUser(["student"]);

    renderRoleRoute(["teacher", "administrator"]);

    expect(
      await screen.findByRole("heading", { name: "Access denied" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your account does not have permission to view this page.",
    );
    expect(screen.queryByText("Role-protected page")).toBeNull();
  });

  it("redirects unauthenticated requests to login and preserves the destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );

    renderRoleRoute(["student"]);

    expect(
      await screen.findByText("Login destination: /role-area"),
    ).toBeTruthy();
    expect(screen.queryByText("Role-protected page")).toBeNull();
  });

  it("does not render protected content during loading or a session error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    const { queryClient, router } = renderRoleRoute(["student"]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your session...",
    );
    expect(screen.queryByText("Role-protected page")).toBeNull();

    router.dispose();
    queryClient.clear();
  });

  it("shows a retryable session error instead of treating it as unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderRoleRoute(["student"]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t check your session. Please try again.",
    );
    expect(screen.queryByText("Role-protected page")).toBeNull();
    expect(screen.queryByText(/Login destination/)).toBeNull();
    expect(screen.queryByText("private diagnostic")).toBeNull();
  });
});
