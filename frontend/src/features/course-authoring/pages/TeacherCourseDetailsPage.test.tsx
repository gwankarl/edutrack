import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import TeacherCourseDetailsPage from "./TeacherCourseDetailsPage.js";

vi.mock("../hooks/useTeacherCourse.js", () => ({
  useTeacherCourse: vi.fn(),
}));

vi.mock("../hooks/useCourseTopics.js", () => ({
  useCourseTopics: vi.fn(),
}));

vi.mock("../components/CourseForm.js", () => ({
  default: ({
    initialCourse,
    onUpdated,
  }: {
    initialCourse?: TeacherCourseResponse;
    onUpdated?: (course: TeacherCourseResponse) => void;
  }) => (
    <div data-testid="course-editor">
      <p>
        {initialCourse ? `Editing ${initialCourse.title}` : "Course editor"}
      </p>
      {initialCourse && (
        <button onClick={() => onUpdated?.(initialCourse)} type="button">
          Save test course
        </button>
      )}
    </div>
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
const mockedUseCourseTopics = vi.mocked(useCourseTopics);

function SearchParamsOutput() {
  const [searchParams] = useSearchParams();

  return (
    <output data-testid="current-search">{searchParams.toString()}</output>
  );
}

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

function topicsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { items: [] },
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCourseTopics>;
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
        <SearchParamsOutput />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherCourseDetailsPage", () => {
  beforeEach(() => {
    mockedUseTeacherCourse.mockReset();
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
    mockedUseCourseTopics.mockReset();
    mockedUseCourseTopics.mockReturnValue(topicsQuery());
  });

  it("shows the course workspace, breadcrumb, Overview, and Draft editor", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Algebra Foundations",
        level: 1,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to My Courses" }),
    ).toHaveAttribute("href", "/teacher/courses");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { name: "Algebra Foundations", level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${course.id}/topics`,
    );
    expect(screen.queryByTestId("course-editor")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Edit Course Details" }),
    );
    expect(screen.getByTestId("course-editor")).toHaveTextContent(
      "Editing Algebra Foundations",
    );
  });

  it("closes after an update and preserves the Overview tab URL", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Edit Course Details" }),
    );
    await user.click(screen.getByRole("button", { name: "Save test course" }));

    expect(screen.getByText("Course details saved.")).toBeVisible();
    expect(screen.queryByTestId("course-editor")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      new URLSearchParams(
        screen.getByTestId("current-search").textContent ?? "",
      ).has("tab"),
    ).toBe(false);
  });

  it("shows the expandable Course Content tree and synchronizes its URL tab", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: "Course Content" }));

    expect(screen.getByRole("tab", { name: "Course Content" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Topics");
    expect(screen.getByRole("link", { name: "Add Topic" })).toHaveAttribute(
      "href",
      `/teacher/courses/${course.id}/topics/new`,
    );
    expect(
      new URLSearchParams(
        screen.getByTestId("current-search").textContent ?? "",
      ).get("tab"),
    ).toBe("content");
  });

  it("restores a selected workspace tab from the URL", () => {
    renderPage(`/teacher/courses/${course.id}?tab=publication`);

    expect(screen.getByRole("tab", { name: "Publication" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Final submission eligibility",
    );
    expect(
      screen.getByRole("button", {
        name: /Submit for Review.*Coming Soon/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Back to My Courses" }),
    ).toHaveAttribute("href", "/teacher/courses");
  });

  it("keeps non-Draft courses read-only", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "published" } }),
    );

    renderPage();

    expect(screen.getByLabelText("Course status: Published")).toHaveTextContent(
      "Published",
    );
    expect(screen.getByText("This course is read-only")).toBeVisible();
    expect(screen.getByRole("link", { name: "View topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${course.id}/topics`,
    );
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
    expect(screen.queryByText("Algebra Foundations")).not.toBeInTheDocument();
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
