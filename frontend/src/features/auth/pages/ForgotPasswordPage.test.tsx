import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "./ForgotPasswordPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function submitEmail(email: string) {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Email"), email);
  await user.click(
    screen.getByRole("button", { name: "Send reset instructions" }),
  );
}

describe("ForgotPasswordPage", () => {
  it("shows the shared enumeration-safe confirmation after success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message:
              "If an account exists for that email, a password reset link will be sent.",
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderPage();
    await submitEmail("ada@example.test");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for that email, a password reset link will be sent.",
    );
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("disables submission while the request is pending", async () => {
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

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.click(
      screen.getByRole("button", { name: "Send reset instructions" }),
    );

    expect(
      screen.getByRole("button", { name: "Sending instructions..." }),
    ).toBeDisabled();

    resolveFetch(
      new Response(
        JSON.stringify({
          message:
            "If an account exists for that email, a password reset link will be sent.",
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("validates malformed email before making an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await submitEmail("not-an-email");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a safe generic message when the API fails", async () => {
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
    await submitEmail("ada@example.test");

    expect(
      await screen.findByText(
        "We couldn’t process your request right now. Please try again later.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });
});
