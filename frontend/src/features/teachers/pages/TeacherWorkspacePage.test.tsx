import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import TeacherWorkspacePage from "./TeacherWorkspacePage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeacherWorkspacePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherWorkspacePage", () => {
  it("welcomes the authenticated user and describes upcoming course tools", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Ada Teacher",
            email: "ada@example.test",
            emailVerified: true,
            accountStatus: "active",
            roles: ["teacher"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Welcome, Ada Teacher!",
      }),
    ).toBeVisible();
    expect(screen.getByText("Teacher workspace")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Your teaching workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Course tools coming later" }),
    ).toBeVisible();

    expect(
      screen.queryByRole("button", { name: /create|manage.*course/i }),
    ).toBeNull();
    expect(screen.queryByText(/\d+\s+(courses|students|lessons)/i)).toBeNull();
  });

  it("shows a loading message while current-user information is being checked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your Teacher workspace",
    );
  });

  it("offers sign-in when the session is unauthenticated", async () => {
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

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Sign in to view this workspace",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows safe retry feedback when current-user lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load your workspace",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });

  it("handles an incomplete current-user response without rendering a broken greeting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            email: "ada@example.test",
            emailVerified: true,
            accountStatus: "active",
            roles: ["teacher"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load your workspace",
    );
    expect(screen.queryByRole("heading", { name: /welcome/i })).toBeNull();
  });
});
