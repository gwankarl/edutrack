import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const authenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada Student",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student"],
};

function LoginDestination() {
  const location = useLocation();
  const state = location.state as { from?: string } | null;

  return <p>Login destination: {state?.from ?? "none"}</p>;
}

function renderProtectedRoute() {
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
        element: <ProtectedRoute />,
        children: [{ path: "/profile", element: <p>Protected profile</p> }],
      },
    ],
    { initialEntries: ["/profile?tab=account#details"] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient, router };
}

describe("ProtectedRoute", () => {
  it("does not show protected content or redirect while the session is loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderProtectedRoute();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your session...",
    );
    expect(screen.queryByText("Protected profile")).toBeNull();
    expect(screen.queryByText(/Login destination/)).toBeNull();
  });

  it("redirects unauthenticated users to login with their internal destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ title: "Authentication required", status: 401 }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderProtectedRoute();

    expect(
      await screen.findByText(
        "Login destination: /profile?tab=account#details",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Protected profile")).toBeNull();
  });

  it("renders protected content for an authenticated user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderProtectedRoute();

    expect(await screen.findByText("Protected profile")).toBeTruthy();
  });

  it("shows a retryable error instead of redirecting after a session-check failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("private diagnostic", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(authenticatedUser), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    const user = userEvent.setup();
    renderProtectedRoute();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t check your session. Please try again.",
    );
    expect(screen.queryByText("Login destination: none")).toBeNull();
    expect(screen.queryByText("private diagnostic")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Protected profile")).toBeTruthy();
  });
});
