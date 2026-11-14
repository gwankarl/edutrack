import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResetPasswordPage from "./ResetPasswordPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const resetToken = "synthetic-reset-token-value-long-enough";
const newPassword = "a synthetic replacement passphrase";

function renderResetPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      {
        path: "/reset-password",
        element: <ResetPasswordPage />,
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

async function fillAndSubmit(password = newPassword, confirmation = password) {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("ResetPasswordPage", () => {
  it("removes the token from the URL and submits it only after form submission", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Password has been reset." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const router = renderResetPage(`/reset-password?token=${resetToken}`);

    expect(await screen.findByLabelText("New password")).toBeTruthy();

    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await fillAndSubmit();

    expect(
      await screen.findByRole("heading", { name: "Password reset" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/reset-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword }),
      }),
    );
    expect(screen.queryByText(resetToken)).toBeNull();
  });

  it("prevents duplicate submissions while the request is pending", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    renderResetPage(`/reset-password?token=${resetToken}`);
    await screen.findByLabelText("New password");
    await fillAndSubmit();

    expect(
      screen.getByRole("button", { name: "Updating password..." }),
    ).toBeDisabled();

    resolveFetch(
      new Response(JSON.stringify({ message: "Password has been reset." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Password reset" }),
    ).toBeTruthy();
  });

  it("rejects mismatched confirmation before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderResetPage(`/reset-password?token=${resetToken}`);
    await screen.findByLabelText("New password");
    await fillAndSubmit(newPassword, "a different replacement passphrase");

    expect(await screen.findByText("Passwords must match.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a clear message for invalid, expired, or already-used tokens", async () => {
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

    renderResetPage(`/reset-password?token=${resetToken}`);
    await screen.findByLabelText("New password");
    await fillAndSubmit();

    expect(
      await screen.findByRole("heading", {
        name: "This reset link can’t be used",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "invalid, expired, or has already been used",
    );
    expect(screen.queryByText(resetToken)).toBeNull();
  });

  it("shows the invalid-link state if the token is missing", () => {
    renderResetPage("/reset-password");

    expect(
      screen.getByRole("heading", {
        name: "This reset link can’t be used",
      }),
    ).toBeTruthy();
  });
});
