import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import LoginForm from "./LoginForm.js";

describe("LoginForm", () => {
  it("shows field validation errors for an empty submission", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(2);
  });

  it("submits normalized login values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <LoginForm onSubmit={onSubmit} />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), " ADA@example.test ");
    await user.type(
      screen.getByLabelText("Password"),
      "a synthetic test passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: "ada@example.test",
        password: "a synthetic test passphrase",
      });
    });
  });

  it("toggles password visibility with an accessible control", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    );

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("disables submission while pending", () => {
    render(
      <MemoryRouter>
        <LoginForm isPending />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Signing in..." }),
    ).toBeDisabled();
  });

  it("links to registration and password recovery", () => {
    render(
      <MemoryRouter>
        <LoginForm />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(
      screen.getByRole("link", { name: "Forgot your password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("renders a supplied error accessibly", () => {
    render(
      <MemoryRouter>
        <LoginForm errorMessage="We couldn't sign you in. Check your details and try again." />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't sign you in. Check your details and try again.",
    );
  });
});
