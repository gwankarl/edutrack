import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage.js";

function ProfileDestination() {
  const location = useLocation();

  return (
    <p>
      Profile destination reached: {location.pathname}
      {location.search}
      {location.hash}
    </p>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLoginPage(initialState?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  queryClient.setQueryData(["auth", "current-user"], {
    id: "cached-user",
  });

  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/profile", element: <ProfileDestination /> },
      { path: "*", element: <p>Unknown destination</p> },
    ],
    { initialEntries: [{ pathname: "/login", state: initialState }] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return queryClient;
}

async function fillAndSubmitLogin() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Email"), " ADA@example.test ");
  await user.type(
    screen.getByLabelText("Password"),
    "a synthetic test passphrase",
  );
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("submits credentials, invalidates auth queries, and navigates to Profile by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          displayName: "Ada Student",
          email: "ada@example.test",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = renderLoginPage();
    await fillAndSubmitLogin();

    expect(
      await screen.findByText("Profile destination reached: /profile"),
    ).toBeTruthy();
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
    expect(
      queryClient.getQueryState(["auth", "current-user"])?.isInvalidated,
    ).toBe(true);
  });

  it("returns to a safe internal destination after successful login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Ada Student",
            email: "ada@example.test",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const queryClient = renderLoginPage({
      from: "/profile?tab=account#details",
    });
    await fillAndSubmitLogin();

    expect(
      await screen.findByText(
        "Profile destination reached: /profile?tab=account#details",
      ),
    ).toBeTruthy();
    expect(
      queryClient.getQueryState(["auth", "current-user"])?.isInvalidated,
    ).toBe(true);
  });

  it("rejects an external post-login destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            displayName: "Ada Student",
            email: "ada@example.test",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderLoginPage({ from: "//example.com/steal-session" });
    await fillAndSubmitLogin();

    expect(
      await screen.findByText("Profile destination reached: /profile"),
    ).toBeTruthy();
    expect(screen.queryByText("Unknown destination")).toBeNull();
  });

  it("disables the form while login is pending", async () => {
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

    renderLoginPage();
    await fillAndSubmitLogin();

    expect(
      screen.getByRole("button", { name: "Signing in..." }),
    ).toBeDisabled();

    resolveFetch(
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          displayName: "Ada Student",
          email: "ada@example.test",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    expect(
      await screen.findByText("Profile destination reached: /profile"),
    ).toBeTruthy();
  });

  it("shows a generic message for invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Authentication failed",
            status: 401,
            detail: "The email or password is incorrect.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderLoginPage();
    await fillAndSubmitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect.",
    );
  });

  it("shows a safe message for other API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderLoginPage();
    await fillAndSubmitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t sign you in right now. Please try again.",
    );
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });
});
