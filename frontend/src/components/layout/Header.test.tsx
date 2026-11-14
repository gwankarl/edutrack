import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import Header from "./Header.js";

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

describe("Header", () => {
  it("uses client-side navigation for Home and Register", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
        <CurrentPath />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );

    await user.click(screen.getByRole("link", { name: "Register" }));

    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      "/register",
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the EduTrack brand linked to Home", () => {
    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "EduTrack home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
