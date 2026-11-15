import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import TeacherLayout from "./TeacherLayout.js";

function renderTeacherLayout(initialPath = "/teacher") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<TeacherLayout />} path="/teacher">
          <Route element={<p>Teacher page content</p>} index />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("TeacherLayout", () => {
  it("renders the workspace heading and nested page through Outlet", () => {
    renderTeacherLayout();

    expect(
      screen.getByRole("heading", { name: "Teaching workspace" }),
    ).toBeVisible();
    expect(screen.getByText("Teacher page content")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Teacher workspace page" }),
    ).toBeVisible();
  });

  it("provides accessible workspace navigation and a non-active course placeholder", () => {
    renderTeacherLayout();

    const navigation = screen.getByRole("navigation", {
      name: "Teacher workspace navigation",
    });
    expect(navigation).toHaveClass("overflow-x-auto", "lg:flex-col");

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(navigation).toHaveTextContent("Courses");
    expect(navigation).toHaveTextContent("Coming soon");
    expect(screen.queryByRole("link", { name: /courses/i })).toBeNull();
  });

  it("supports keyboard focus on the active workspace link", async () => {
    const user = userEvent.setup();
    renderTeacherLayout();

    await user.tab();

    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
  });

  it("identifies this shell as the Teacher workspace", () => {
    renderTeacherLayout();

    expect(screen.getByText("Teacher workspace")).toBeVisible();
    expect(screen.getByText("Teacher", { selector: "div" })).toBeVisible();
  });
});
