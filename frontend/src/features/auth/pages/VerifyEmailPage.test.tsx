import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import VerifyEmailPage from "./VerifyEmailPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderVerificationPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      {
        path: "/verify-email",
        element: <VerifyEmailPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe("VerifyEmailPage", () => {
  it("shows loading, removes the token from the URL, and then shows success", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const router = renderVerificationPage(
      "/verify-email?token=synthetic-verification-token-value-long-enough",
    );

    expect(
      await screen.findByRole("heading", { name: "Verifying your email" }),
    ).toBeTruthy();

    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/verify-email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "synthetic-verification-token-value-long-enough",
        }),
      }),
    );

    resolveFetch(
      new Response(JSON.stringify({ message: "Email verified." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Email verified" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows safe feedback for invalid, expired, or already-used tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Invalid or expired token",
            status: 400,
            detail: "The token is invalid, expired, or already used.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderVerificationPage(
      "/verify-email?token=synthetic-verification-token-value-long-enough",
    );

    expect(
      await screen.findByRole("heading", {
        name: "This verification link can’t be used",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "invalid, expired, or has already been used",
    );
    expect(
      screen.queryByText("synthetic-verification-token-value-long-enough"),
    ).toBeNull();
  });

  it("shows an invalid-link state when the token is missing", () => {
    renderVerificationPage("/verify-email");

    expect(
      screen.getByRole("heading", {
        name: "This verification link can’t be used",
      }),
    ).toBeTruthy();
  });
});
