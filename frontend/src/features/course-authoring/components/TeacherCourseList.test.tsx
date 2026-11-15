import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

import TeacherCourseList from "./TeacherCourseList.js";

const courses = [
  {
    id: "550e8400-e29b-41d4-a716-446655440020",
    title: "Introduction to Algebra",
    description: "An introduction to algebra.",
    academicLevel: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      code: "form-4",
      name: "Form 4",
      educationStage: "lower_secondary",
      sortOrder: 4,
    },
    subject: {
      id: "550e8400-e29b-41d4-a716-446655440010",
      code: "mathematics",
      name: "Mathematics",
      sortOrder: 1,
    },
    status: "draft",
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-16T12:30:00.000Z",
  },
] satisfies TeacherCourseResponse[];

const pagination: TeacherCourseListResponse["pagination"] = {
  page: 2,
  pageSize: 10,
  totalItems: 21,
  totalPages: 3,
};

describe("TeacherCourseList", () => {
  it("shows course details, dates, Draft status, and the details link", () => {
    render(
      <MemoryRouter>
        <TeacherCourseList
          courses={courses}
          isFetching={false}
          onPageChange={vi.fn()}
          pagination={pagination}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("table", { name: "Your courses" })).toBeVisible();
    expect(screen.getByText("Introduction to Algebra")).toBeVisible();
    expect(screen.getByText("Form 4")).toBeVisible();
    expect(screen.getByText("Mathematics")).toBeVisible();
    expect(screen.getByText("Draft")).toHaveClass("bg-info-surface");
    expect(screen.getByText(/Page 2 of 3.*21 courses/)).toBeVisible();
    expect(screen.getAllByRole("time")).toHaveLength(2);
    expect(
      screen.getByRole("link", {
        name: "View details for Introduction to Algebra",
      }),
    ).toHaveAttribute(
      "href",
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020",
    );
  });

  it("disables pagination at its bounds and reports page changes accessibly", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <MemoryRouter>
        <TeacherCourseList
          courses={courses}
          isFetching={false}
          onPageChange={onPageChange}
          pagination={pagination}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    expect(
      screen.getByRole("navigation", { name: "Course pages" }),
    ).toBeVisible();
  });

  it("disables page actions while a query is fetching", () => {
    render(
      <MemoryRouter>
        <TeacherCourseList
          courses={courses}
          isFetching
          onPageChange={vi.fn()}
          pagination={pagination}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
