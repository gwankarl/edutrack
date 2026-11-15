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
          <Route element={<p>Teacher course list</p>} path="courses" />
          <Route element={<p>Create course form</p>} path="courses/new" />
          <Route element={<p>Course details</p>} path="courses/:courseId" />
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

  it("provides accessible workspace navigation with a My Courses link", () => {
    renderTeacherLayout();

    const navigation = screen.getByRole("navigation", {
      name: "Teacher workspace navigation",
    });
    expect(navigation).toHaveClass("overflow-x-auto", "lg:flex-col");

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "href",
      "/teacher/courses",
    );
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it.each([
    ["/teacher/courses", "Teacher course list"],
    ["/teacher/courses/new", "Create course form"],
    ["/teacher/courses/550e8400-e29b-41d4-a716-446655440020", "Course details"],
  ])("marks My Courses active for %s", (path, pageText) => {
    renderTeacherLayout(path);

    expect(screen.getByText(pageText)).toBeVisible();
    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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
