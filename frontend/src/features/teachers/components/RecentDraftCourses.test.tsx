import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TeacherDashboardSummaryResponse } from "@edutrack/contracts";

import RecentDraftCourses from "./RecentDraftCourses.js";

const courses: TeacherDashboardSummaryResponse["recentDraftCourses"] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440021",
    title: "Second most recently updated",
    status: "draft",
    updatedAt: "2026-11-15T10:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440022",
    title: "Most recently updated",
    status: "draft",
    updatedAt: "2026-11-16T10:00:00.000Z",
  },
];

function CurrentPath() {
  const location = useLocation();

  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderRecentDrafts(
  props: Partial<React.ComponentProps<typeof RecentDraftCourses>> = {},
) {
  return render(
    <MemoryRouter>
      <CurrentPath />
      <RecentDraftCourses
        courses={courses}
        isError={false}
        isFetching={false}
        isLoading={false}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("RecentDraftCourses", () => {
  it("renders recent drafts in backend order with metadata and course links", () => {
    renderRecentDrafts();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Second most recently updated"),
      expect.stringContaining("Most recently updated"),
    ]);

    expect(
      screen.getByRole("link", {
        name: "Open course: Second most recently updated",
      }),
    ).toHaveAttribute(
      "href",
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440021",
    );
    expect(screen.getAllByText(/Draft · Updated/)).toHaveLength(2);
    expect(within(links[0]!).getByRole("time")).toHaveAttribute(
      "dateTime",
      courses[0]!.updatedAt,
    );
  });

  it("navigates to the selected course without a full-page reload", async () => {
    const user = userEvent.setup();
    renderRecentDrafts();

    await user.click(
      screen.getByRole("link", {
        name: "Open course: Second most recently updated",
      }),
    );

    expect(screen.getByTestId("current-path")).toHaveTextContent(
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440021",
    );
  });

  it("shows an accessible loading state", () => {
    renderRecentDrafts({ isLoading: true });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading recent Draft courses",
    );
  });

  it("shows a safe error and retries", () => {
    const onRetry = vi.fn();
    renderRecentDrafts({ isError: true, onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load your Draft courses",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows an empty state when there are no drafts", () => {
    renderRecentDrafts({ courses: [] });

    expect(screen.getByRole("status")).toHaveTextContent(
      "You do not have any Draft courses yet.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
