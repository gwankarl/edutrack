import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import RegistrationConfirmationPage from "./RegistrationConfirmationPage.js";
import RegisterPage from "./RegisterPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRegistrationRoutes() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      {
        path: "/register",
        element: <RegisterPage />,
      },
      {
        path: "/registration-confirmation",
        element: <RegistrationConfirmationPage />,
      },
    ],
    { initialEntries: ["/register"] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function fillAndSubmitRegistrationForm() {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Display name"), "Ada Student");
  await user.type(screen.getByLabelText("Email"), "ada@example.test");
  await user.type(
    screen.getByLabelText("Password"),
    "a synthetic test passphrase",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "a synthetic test passphrase",
  );
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("RegisterPage", () => {
  it("navigates to confirmation and displays the email after successful registration", async () => {
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
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderRegistrationRoutes();
    await fillAndSubmitRegistrationForm();

    expect(
      await screen.findByRole("heading", { name: "Check your email" }),
    ).toBeTruthy();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
  });

  it("does not navigate when registration fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderRegistrationRoutes();
    await fillAndSubmitRegistrationForm();

    expect(
      await screen.findByText(
        "We couldn't create your account. Please check your details and try again.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Create your EduTrack account" }),
    ).toBeTruthy();
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });
});
