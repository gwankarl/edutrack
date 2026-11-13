import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import Header from "./Header.js";

describe("Header", () => {
  it("navigates to Home using the public navigation link", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Header />
      </MemoryRouter>,
    );

    const homeLink = screen.getByRole("link", { name: "Home" });

    expect(homeLink).not.toHaveAttribute("aria-current", "page");

    await user.click(homeLink);

    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "EduTrack home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
