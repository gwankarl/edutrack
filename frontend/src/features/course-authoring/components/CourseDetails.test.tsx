import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import CourseDetails from "./CourseDetails.js";

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
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:30:00.000Z",
} satisfies TeacherCourseResponse;

describe("CourseDetails", () => {
  it("shows the course description, level, subject, status, and timestamps", () => {
    render(<CourseDetails course={course} />);

    expect(
      screen.getByRole("heading", { name: "Algebra Foundations" }),
    ).toBeVisible();
    expect(screen.getByText("Linear equations and expressions.")).toBeVisible();
    expect(screen.getByText("Form 4 · Mathematics")).toBeVisible();
    expect(screen.getByText("Form 4", { selector: "dd" })).toBeVisible();
    expect(screen.getByText("Mathematics", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Draft");
    expect(screen.getAllByRole("time")).toHaveLength(2);
  });

  it("shows a helpful message when the description is empty", () => {
    render(<CourseDetails course={{ ...course, description: null }} />);

    expect(screen.getByText("No description provided.")).toBeVisible();
  });
});
