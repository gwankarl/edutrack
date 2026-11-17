import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import CourseCard from "./CourseCard.js";

const courseBase = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Introduction to Algebra",
  description: "A concise introduction to algebraic concepts.",
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

function renderCard(course: TeacherCourseResponse) {
  return render(
    <MemoryRouter>
      <CourseCard course={course} />
    </MemoryRouter>,
  );
}

describe("CourseCard", () => {
  it("shows course information and a 16:9 placeholder", () => {
    renderCard({ ...courseBase, status: "draft" });

    expect(
      screen.getByRole("heading", { name: "Introduction to Algebra" }),
    ).toBeVisible();
    expect(
      screen.getByText("A concise introduction to algebraic concepts."),
    ).toBeVisible();
    expect(screen.getByText("Form 4")).toBeVisible();
    expect(screen.getByText("Mathematics")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Course thumbnail placeholder" })
        .parentElement,
    ).toHaveClass("aspect-video");
  });

  it.each([
    ["draft", "Draft", "Continue editing"],
    ["pending_review", "Pending review", "View course"],
    ["published", "Published", "View course"],
    ["rejected", "Rejected", "View course"],
  ] as const)(
    "shows the correct status and action for %s courses",
    (status, statusLabel, actionLabel) => {
      renderCard({ ...courseBase, status });

      expect(screen.getByText(statusLabel)).toBeVisible();
      expect(
        screen.getByRole("link", {
          name: `${actionLabel}: Introduction to Algebra`,
        }),
      ).toHaveAttribute(
        "href",
        "/teacher/courses/550e8400-e29b-41d4-a716-446655440020",
      );
    },
  );

  it("handles a missing description", () => {
    renderCard({ ...courseBase, description: null, status: "draft" });

    expect(screen.getByText("No description provided.")).toBeVisible();
  });

  it("renders the uploaded course thumbnail instead of the placeholder", () => {
    renderCard({
      ...courseBase,
      status: "draft",
      thumbnail: {
        url: "https://images.example.test/algebra.webp",
        width: 1600,
        height: 900,
        format: "webp",
      },
    });

    const image = screen.getByRole("img", {
      name: "Introduction to Algebra course cover",
    });

    expect(image).toHaveAttribute(
      "src",
      "https://images.example.test/algebra.webp",
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image.parentElement).toHaveClass("aspect-video");
    expect(
      screen.queryByRole("img", { name: "Course thumbnail placeholder" }),
    ).not.toBeInTheDocument();
  });
});
