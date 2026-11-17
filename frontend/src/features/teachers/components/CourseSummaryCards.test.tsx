import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TeacherDashboardSummaryResponse } from "@edutrack/contracts";

import CourseSummaryCards from "./CourseSummaryCards.js";

const summary: TeacherDashboardSummaryResponse = {
  statusCounts: {
    total: 12,
    draft: 6,
    pendingReview: 3,
    published: 2,
    rejected: 1,
  },
  recentDraftCourses: [],
};

describe("CourseSummaryCards", () => {
  it("shows the real total, Draft, In Review, and Published counts", () => {
    render(
      <CourseSummaryCards
        isError={false}
        isFetching={false}
        isLoading={false}
        onRetry={vi.fn()}
        summary={summary}
      />,
    );

    expect(
      screen.getByRole("article", { name: "Total Courses summary" }),
    ).toHaveTextContent("12");
    expect(
      screen.getByRole("article", { name: "Draft Courses summary" }),
    ).toHaveTextContent("6");
    expect(
      screen.getByRole("article", { name: "In Review summary" }),
    ).toHaveTextContent("3");
    expect(
      screen.getByRole("article", { name: "Published summary" }),
    ).toHaveTextContent("2");
  });

  it("shows loading feedback and card skeletons", () => {
    const { container } = render(
      <CourseSummaryCards
        isError={false}
        isFetching
        isLoading
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading course summary",
    );
    expect(
      container.querySelectorAll('[aria-hidden="true"] > div'),
    ).toHaveLength(4);
  });

  it("shows a safe error and retries on request", () => {
    const onRetry = vi.fn();

    render(
      <CourseSummaryCards
        isError
        isFetching={false}
        isLoading={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't load your course summary",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
