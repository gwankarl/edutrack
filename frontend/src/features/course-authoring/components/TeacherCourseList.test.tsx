import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

import TeacherCourseList from "./TeacherCourseList.js";

const courseBase = {
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
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:30:00.000Z",
} satisfies Omit<TeacherCourseResponse, "status">;

const courses: TeacherCourseResponse[] = [
  { ...courseBase, status: "draft" },
  {
    ...courseBase,
    id: "550e8400-e29b-41d4-a716-446655440021",
    title: "Course pending review",
    status: "pending_review",
  },
  {
    ...courseBase,
    id: "550e8400-e29b-41d4-a716-446655440022",
    title: "Published course",
    status: "published",
  },
  {
    ...courseBase,
    id: "550e8400-e29b-41d4-a716-446655440023",
    title: "Rejected course",
    status: "rejected",
  },
];

const pagination: TeacherCourseListResponse["pagination"] = {
  page: 2,
  pageSize: 10,
  totalItems: 21,
  totalPages: 3,
};

function renderList() {
  return render(
    <MemoryRouter>
      <TeacherCourseList
        courses={courses}
        isFetching={false}
        onPageChange={vi.fn()}
        pagination={pagination}
      />
    </MemoryRouter>,
  );
}

describe("TeacherCourseList", () => {
  it("defaults to grid view and preserves server item order", () => {
    renderList();

    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const grid = screen.getByRole("list", { name: "Courses in grid view" });
    expect(
      within(grid)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(courses.map(({ title }) => title));
    expect(within(grid).getAllByRole("article")).toHaveLength(4);
  });

  it("switches to list view accessibly", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "List" }));

    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("list", { name: "Courses in list view" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("list", { name: "Courses in grid view" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("List view selected.");
  });

  it("retains the course detail links and status-specific actions", () => {
    renderList();

    expect(
      screen.getByRole("link", {
        name: "Continue editing: Introduction to Algebra",
      }),
    ).toHaveAttribute(
      "href",
      "/teacher/courses/550e8400-e29b-41d4-a716-446655440020",
    );
    expect(
      screen.getByRole("link", { name: "View course: Course pending review" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View course: Published course" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View course: Rejected course" }),
    ).toBeVisible();
  });

  it("preserves pagination and page changes", async () => {
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

    expect(screen.getByText("Page 2 of 3 — 21 courses")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables pagination while fetching and at page bounds", () => {
    const { rerender } = render(
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

    rerender(
      <MemoryRouter>
        <TeacherCourseList
          courses={courses}
          isFetching={false}
          onPageChange={vi.fn()}
          pagination={{ ...pagination, page: 1 }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
