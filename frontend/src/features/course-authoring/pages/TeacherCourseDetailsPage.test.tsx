import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import TeacherCourseDetailsPage from "./TeacherCourseDetailsPage.js";

vi.mock("../hooks/useTeacherCourse.js", () => ({
  useTeacherCourse: vi.fn(),
}));

vi.mock("../components/CourseForm.js", () => ({
  default: ({ initialCourse }: { initialCourse?: TeacherCourseResponse }) => (
    <p data-testid="course-editor">
      {initialCourse ? `Editing ${initialCourse.title}` : "Course editor"}
    </p>
  ),
}));

const course = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Algebra Foundations",
  description: null,
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

const mockedUseTeacherCourse = vi.mocked(useTeacherCourse);

function courseQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: course,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTeacherCourse>;
}

function renderPage(path = `/teacher/courses/${course.id}`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/teacher/courses/:courseId"
            element={<TeacherCourseDetailsPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherCourseDetailsPage", () => {
  beforeEach(() => {
    mockedUseTeacherCourse.mockReset();
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
  });

  it("shows course details and offers the edit form for Draft courses", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Course details", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("Algebra Foundations")).toBeVisible();
    expect(screen.getByTestId("course-editor")).toHaveTextContent(
      "Editing Algebra Foundations",
    );
  });

  it("keeps non-Draft courses read-only", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "published" } }),
    );

    renderPage();

    expect(screen.getAllByText("Published")).toHaveLength(2);
    expect(screen.getByText("This course is read-only")).toBeVisible();
    expect(screen.queryByTestId("course-editor")).not.toBeInTheDocument();
  });

  it("handles loading and forbidden access", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, isPending: true }),
    );
    const { unmount } = renderPage();
    expect(
      screen.getByText("Please wait while the course loads."),
    ).toBeVisible();

    unmount();
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, authorizationStatus: "forbidden" }),
    );
    renderPage();
    expect(screen.getByText("Teacher access required")).toBeVisible();
  });

  it("offers sign in for an unauthenticated user", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, authorizationStatus: "unauthenticated" }),
    );

    renderPage();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("Algebra Foundations")).not.toBeInTheDocument();
  });

  it("shows a concealed not-found state for a 404", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 404, title: "Not found" }),
      }),
    );

    renderPage();

    expect(screen.getByText("Course not found")).toBeVisible();
    expect(screen.queryByText("Algebra Foundations")).not.toBeInTheDocument();
  });

  it("rejects malformed course IDs before rendering course data", () => {
    renderPage("/teacher/courses/not-a-uuid");

    expect(screen.getByText("Invalid course link")).toBeVisible();
    expect(screen.queryByText("Algebra Foundations")).not.toBeInTheDocument();
  });
});
