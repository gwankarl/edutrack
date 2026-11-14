import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import RegistrationConfirmationPage from "./RegistrationConfirmationPage.js";

describe("RegistrationConfirmationPage", () => {
  it("shows the confirmation message, registered email, and registration link", () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/registration-confirmation",
            state: { email: "ada@example.test" },
          },
        ]}
      >
        <Routes>
          <Route
            element={<RegistrationConfirmationPage />}
            path="/registration-confirmation"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Follow the verification link",
    );
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Return to registration" }),
    ).toHaveAttribute("href", "/register");
  });

  it("shows confirmation content when no email is available in route state", () => {
    render(
      <MemoryRouter initialEntries={["/registration-confirmation"]}>
        <Routes>
          <Route
            element={<RegistrationConfirmationPage />}
            path="/registration-confirmation"
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Check your email" }),
    ).toBeTruthy();
    expect(screen.queryByText("ada@example.test")).toBeNull();
  });
});
