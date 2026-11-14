import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RegistrationForm from "./RegistrationForm.js";

describe("RegistrationForm", () => {
  it("shows field-level validation errors for an empty submission", async () => {
    const user = userEvent.setup();

    render(<RegistrationForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findAllByRole("alert")).toHaveLength(4);
  });

  it("rejects confirmation that does not match the password", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Display name"), "Synthetic Student");
    await user.type(screen.getByLabelText("Email"), "student@example.test");
    await user.type(
      screen.getByLabelText("Password"),
      "a synthetic test passphrase",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "a different synthetic passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Passwords must match.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits normalized values without the confirmation field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Display name"), "  Ada Student  ");
    await user.type(screen.getByLabelText("Email"), " ADA@example.test ");
    await user.type(
      screen.getByLabelText("Password"),
      "a synthetic test passphrase",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "a synthetic test passphrase",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        displayName: "Ada Student",
        email: "ada@example.test",
        password: "a synthetic test passphrase",
      });
    });
  });

  it("supports keyboard traversal and Enter submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<RegistrationForm onSubmit={onSubmit} />);

    await user.tab();
    expect(screen.getByLabelText("Display name")).toHaveFocus();
    await user.type(screen.getByLabelText("Display name"), "Ada Student");

    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.type(screen.getByLabelText("Email"), "ada@example.test");

    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.type(
      screen.getByLabelText("Password"),
      "a synthetic test passphrase",
    );

    await user.tab();
    expect(screen.getByLabelText("Confirm password")).toHaveFocus();
    await user.type(
      screen.getByLabelText("Confirm password"),
      "a synthetic test passphrase",
    );

    await user.tab();
    const submitButton = screen.getByRole("button", {
      name: "Create account",
    });
    expect(submitButton).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        displayName: "Ada Student",
        email: "ada@example.test",
        password: "a synthetic test passphrase",
      });
    });
  });

  it("disables submission while the mutation is pending", () => {
    render(<RegistrationForm isPending onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Creating account..." }),
    ).toBeDisabled();
  });

  it("renders server field and general errors accessibly", () => {
    render(
      <RegistrationForm
        errorMessage="We couldn't create your account. Please try again."
        fieldErrors={{ email: "Enter a valid email." }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Enter a valid email.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByText("We couldn't create your account. Please try again."),
    ).toHaveAttribute("role", "alert");
  });

  it("renders successful registration feedback as a status message", () => {
    render(
      <RegistrationForm
        onSubmit={vi.fn()}
        successMessage="Account created. Check your email for a verification link."
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Account created. Check your email for a verification link.",
    );
  });
});
