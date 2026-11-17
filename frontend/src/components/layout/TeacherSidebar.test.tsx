import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import TeacherSidebar from "./TeacherSidebar.js";

const userId = "00000000-0000-4000-8000-000000000001";

function renderSidebar(initialPath = "/teacher", renderDuplicate = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  queryClient.setQueryData(currentUserQueryKey, {
    id: userId,
    displayName: "Synthetic Teacher",
    email: "teacher@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles: ["student", "teacher"],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            element={
              renderDuplicate ? (
                <>
                  <TeacherSidebar />
                  <TeacherSidebar className="w-full rounded-lg border border-border bg-surface p-4" />
                </>
              ) : (
                <TeacherSidebar />
              )
            }
            path="*"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherSidebar", () => {
  it("places the workspace switcher before the navigation links", () => {
    renderSidebar();

    expect(screen.getByRole("combobox", { name: "Workspace" })).toBeVisible();

    const navigation = screen.getByRole("navigation", {
      name: "Teacher workspace navigation",
    });
    expect(navigation).toBeVisible();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/teacher",
    );
    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "href",
      "/teacher/courses",
    );
    expect(screen.getByRole("link", { name: "My Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("marks Overview active at the Teacher landing route", () => {
    renderSidebar("/teacher");

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "My Courses" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  it.each([
    "/teacher/courses",
    "/teacher/courses/new",
    "/teacher/courses/course-id",
    "/teacher/courses/course-id/topics/topic-id",
    "/teacher/courses/course-id/topics/topic-id/quizzes/quiz-id/questions/question-id",
  ])("keeps My Courses active on nested route %s", (path) => {
    renderSidebar(path);

    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks My Profile active only on the profile route", () => {
    renderSidebar("/profile");

    expect(screen.getByRole("link", { name: "My Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows Reviews as disabled and labeled Coming Soon", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: "Reviews, Coming Soon" }),
    ).toBeDisabled();
    expect(screen.getByText("Coming Soon")).toBeVisible();
  });

  it("uses unique heading and workspace-select IDs when sidebar copies coexist", () => {
    renderSidebar("/teacher", true);

    const sidebarLabels = Array.from(
      document.querySelectorAll("aside[aria-labelledby]"),
      (sidebar) => sidebar.getAttribute("aria-labelledby"),
    );
    expect(new Set(sidebarLabels).size).toBe(sidebarLabels.length);

    const workspaceSelects = Array.from(
      document.querySelectorAll<HTMLSelectElement>(
        'select[aria-label="Workspace"]',
      ),
    );
    const workspaceSelectIds = workspaceSelects.map((select) => select.id);
    expect(new Set(workspaceSelectIds).size).toBe(workspaceSelectIds.length);

    for (const select of workspaceSelects) {
      expect(
        document.querySelector(`label[for="${select.id}"]`),
      ).not.toBeNull();
    }
  });

  it("supports keyboard navigation through active links", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.tab();
    expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
  });
});
