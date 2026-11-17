import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import TeacherLayout from "./TeacherLayout.js";

const currentUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "teacher"],
};

function renderTeacherLayout(initialPath = "/teacher") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  queryClient.setQueryData(currentUserQueryKey, currentUser);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<TeacherLayout />} path="/teacher">
            <Route element={<p>Teacher page content</p>} index />
            <Route element={<p>Teacher course list</p>} path="courses" />
            <Route element={<p>Create course form</p>} path="courses/new" />
            <Route element={<p>Course details</p>} path="courses/:courseId" />
            <Route
              element={<p>Course topics</p>}
              path="courses/:courseId/topics"
            />
            <Route
              element={<p>Create topic form</p>}
              path="courses/:courseId/topics/new"
            />
            <Route
              element={<p>Topic details</p>}
              path="courses/:courseId/topics/:topicId"
            />
            <Route
              element={<p>Create lesson form</p>}
              path="courses/:courseId/topics/:topicId/lessons/new"
            />
            <Route
              element={<p>Lesson editor</p>}
              path="courses/:courseId/topics/:topicId/lessons/:lessonId"
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherLayout", () => {
  it("renders the sidebar and nested page through Outlet", () => {
    renderTeacherLayout();

    expect(
      screen.getByRole("heading", { name: "Teaching workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Teacher workspace" }),
    ).toBeVisible();
    expect(screen.getByText("Teacher page content")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Teacher workspace page" }),
    ).toBeVisible();
  });

  it("keeps the desktop sidebar expanded and reserves a responsive sidebar column", () => {
    const { container } = renderTeacherLayout();

    const sidebar = container.querySelector("aside");
    expect(sidebar?.parentElement).toHaveClass("hidden", "lg:block");
    expect(
      container.querySelector(
        ".lg\\:grid-cols-\\[14rem_minmax\\(0\\,1fr\\)\\]",
      ),
    ).not.toBeNull();
  });

  it("renders the workspace switcher inside the sidebar", () => {
    renderTeacherLayout();

    const sidebar = screen.getByRole("complementary", {
      name: "Teacher workspace",
    });

    expect(screen.getByRole("combobox", { name: "Workspace" })).toBeVisible();
    expect(sidebar).toContainElement(
      screen.getByRole("navigation", {
        name: "Teacher workspace navigation",
      }),
    );
  });

  it("uses a shrinkable desktop content grid", () => {
    renderTeacherLayout();

    expect(
      screen.getByRole("region", { name: "Teacher workspace page" }),
    ).toHaveClass("min-w-0", "max-w-full");
  });

  it.each([
    ["/teacher/courses", "Teacher course list"],
    ["/teacher/courses/new", "Create course form"],
    ["/teacher/courses/course-id", "Course details"],
    ["/teacher/courses/course-id/topics", "Course topics"],
    ["/teacher/courses/course-id/topics/new", "Create topic form"],
    ["/teacher/courses/course-id/topics/topic-id", "Topic details"],
    [
      "/teacher/courses/course-id/topics/topic-id/lessons/new",
      "Create lesson form",
    ],
    [
      "/teacher/courses/course-id/topics/topic-id/lessons/lesson-id",
      "Lesson editor",
    ],
  ])("renders %s through the Teacher layout", (path, pageText) => {
    renderTeacherLayout(path);

    expect(screen.getByText(pageText)).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Teacher workspace" }),
    ).toBeVisible();
  });

  it("keeps My Courses active for nested course-authoring routes", () => {
    renderTeacherLayout(
      "/teacher/courses/course-id/topics/topic-id/lessons/lesson-id",
    );

    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("supports keyboard navigation from the workspace switcher to Overview", async () => {
    const user = userEvent.setup();
    renderTeacherLayout();

    await user.tab();
    expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
  });
});
