import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import CourseOverview from "./CourseOverview.js";

vi.mock("./CourseForm.js", () => ({
  default: ({
    initialCourse,
    onUpdated,
  }: {
    initialCourse: TeacherCourseResponse;
    onUpdated?: (course: TeacherCourseResponse) => void;
  }) => (
    <div data-testid="course-form">
      <p>Editing {initialCourse.title}</p>
      <button onClick={() => onUpdated?.(initialCourse)} type="button">
        Save test course
      </button>
    </div>
  ),
}));

const course = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Algebra Foundations",
  description: "Linear equations and expressions.",
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
  thumbnail: null,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:30:00.000Z",
} satisfies TeacherCourseResponse;

function renderOverview(
  courseResponse: TeacherCourseResponse = course,
  onUpdated = vi.fn(),
) {
  render(
    <MemoryRouter>
      <CourseOverview course={courseResponse} onUpdated={onUpdated} />
    </MemoryRouter>,
  );

  return { onUpdated };
}

describe("CourseOverview", () => {
  it("shows a consistent 16:9 fallback when no thumbnail exists", () => {
    renderOverview();

    expect(
      screen.getByRole("img", {
        name: "Algebra Foundations has no course thumbnail",
      }),
    ).toBeVisible();
    expect(screen.getByText("No course thumbnail uploaded")).toBeVisible();
  });

  it("shows the saved Cloudinary image with useful alternative text", () => {
    renderOverview({
      ...course,
      thumbnail: {
        url: "https://res.cloudinary.com/demo/image/upload/course.webp",
        width: 1280,
        height: 720,
        format: "webp",
      },
    });

    const image = screen.getByRole("img", {
      name: "Algebra Foundations course thumbnail",
    });
    expect(image).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/image/upload/course.webp",
    );
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("shows the course metadata, dates, status, and topic link", () => {
    renderOverview();

    expect(screen.getByText("Linear equations and expressions.")).toBeVisible();
    expect(screen.getByText("Form 4", { selector: "dd" })).toBeVisible();
    expect(screen.getByText("Mathematics", { selector: "dd" })).toBeVisible();
    expect(screen.getAllByRole("time")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Manage topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${course.id}/topics`,
    );
  });

  it("opens and cancels the existing Draft course form", async () => {
    const user = userEvent.setup();
    renderOverview();

    await user.click(
      screen.getByRole("button", { name: "Edit Course Details" }),
    );
    expect(screen.getByTestId("course-form")).toHaveTextContent(
      "Editing Algebra Foundations",
    );

    await user.click(screen.getByRole("button", { name: "Cancel editing" }));
    expect(screen.queryByTestId("course-form")).not.toBeInTheDocument();
  });

  it("closes the form and reports success after an update", async () => {
    const user = userEvent.setup();
    const { onUpdated } = renderOverview();

    await user.click(
      screen.getByRole("button", { name: "Edit Course Details" }),
    );
    await user.click(screen.getByRole("button", { name: "Save test course" }));

    expect(onUpdated).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Course details saved.",
    );
    expect(screen.queryByTestId("course-form")).not.toBeInTheDocument();
  });

  it("shows read-only information without an edit action for non-Draft courses", () => {
    renderOverview({ ...course, status: "published" });

    expect(screen.getByText("This course is read-only")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit Course Details" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("course-form")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${course.id}/topics`,
    );
  });
});
