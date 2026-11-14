import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "./ProfilePage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderProfilePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  it("displays profile details after the current-user request succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Ada Student",
            email: "ada@example.test",
            emailVerified: true,
            accountStatus: "active",
            roles: ["student", "teacher"],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderProfilePage();

    expect(
      await screen.findByRole("heading", { name: "My profile" }),
    ).toBeTruthy();
    expect(await screen.findByText("Ada Student")).toBeTruthy();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Student")).toBeTruthy();
    expect(screen.getByText("Teacher")).toBeTruthy();
    expect(screen.queryByText(/password|session token/i)).toBeNull();
  });

  it("shows a loading status while the current-user request is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderProfilePage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your profile...",
    );
  });

  it("handles HTTP 401 as unauthenticated", async () => {
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

    renderProfilePage();

    expect(
      await screen.findByText(
        "You are not signed in. Sign in to view your profile.",
      ),
    ).toBeTruthy();
  });

  it("shows safe feedback for other API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderProfilePage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t load your profile right now.",
    );
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });
});
