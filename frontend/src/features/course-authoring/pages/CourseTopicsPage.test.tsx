import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseResponse,
  TeacherTopicListResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import CourseTopicsPage from "./CourseTopicsPage.js";

vi.mock("../hooks/useCourseTopics.js", () => ({
  useCourseTopics: vi.fn(),
}));
vi.mock("../hooks/useTeacherCourse.js", () => ({
  useTeacherCourse: vi.fn(),
}));

const course = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  title: "Algebra Foundations",
  description: "An introductory algebra course.",
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
  updatedAt: "2026-11-15T12:00:00.000Z",
} satisfies TeacherCourseResponse;

const topics: TeacherTopicListResponse = {
  items: [
    {
      id: "550e8400-e29b-41d4-a716-446655440021",
      courseId: course.id,
      title: "Linear equations",
      description: "An introduction to equations.",
      position: 1,
      createdAt: "2026-11-15T12:00:00.000Z",
      updatedAt: "2026-11-15T12:00:00.000Z",
    },
  ],
};

const mockedUseCourseTopics = vi.mocked(useCourseTopics);
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

function topicsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: topics,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCourseTopics>;
}

function renderPage(path = `/teacher/courses/${course.id}/topics`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            element={<CourseTopicsPage />}
            path="/teacher/courses/:courseId/topics"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CourseTopicsPage", () => {
  beforeEach(() => {
    mockedUseTeacherCourse.mockReset();
    mockedUseCourseTopics.mockReset();
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
    mockedUseCourseTopics.mockReturnValue(topicsQuery());
  });

  it("shows course information, ordered topics, and Draft actions", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Course topics", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Algebra Foundations" }),
    ).toBeVisible();
    expect(screen.getByText("Form 4 · Mathematics")).toBeVisible();
    expect(screen.getByText("Linear equations")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "My Courses" })).toHaveAttribute(
      "href",
      "/teacher/courses",
    );
    expect(
      screen.getByRole("link", { name: "Algebra Foundations" }),
    ).toHaveAttribute("href", `/teacher/courses/${course.id}`);
    expect(screen.getByRole("link", { name: "Add Topic" })).toBeVisible();
    expect(mockedUseCourseTopics).toHaveBeenCalledWith(course.id);
  });

  it("keeps non-Draft topic information read-only", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "published" } }),
    );

    renderPage();

    expect(screen.getByText("Topics are read-only")).toBeVisible();
    expect(screen.getByText("Linear equations")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add Topic" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /view or edit topic/i }),
    ).toBeNull();
  });

  it("shows loading states for the course and its topics", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, isPending: true }),
    );
    const { unmount } = renderPage();
    expect(
      screen.getByText("Please wait while the course loads."),
    ).toBeVisible();

    unmount();
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
    mockedUseCourseTopics.mockReturnValue(
      topicsQuery({ data: undefined, isPending: true }),
    );
    renderPage();
    expect(
      screen.getByText("Please wait while this course's topics load."),
    ).toBeVisible();
  });

  it("shows an empty topic state", () => {
    mockedUseCourseTopics.mockReturnValue(topicsQuery({ data: { items: [] } }));

    renderPage();

    expect(
      screen.getByText(
        "This course has no topics yet. Add a topic to begin organizing its content.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add Topic" })).toBeVisible();
  });

  it("conceals topics when the course is missing or the user is not authorized", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 404, title: "Not found" }),
      }),
    );
    const { unmount } = renderPage();
    expect(screen.getByText("Course not found")).toBeVisible();
    expect(screen.queryByText("Linear equations")).toBeNull();

    unmount();
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, authorizationStatus: "forbidden" }),
    );
    renderPage();
    expect(screen.getByText("Teacher access required")).toBeVisible();
    expect(screen.queryByText("Linear equations")).toBeNull();
  });

  it("shows a retry action for topic API failures", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseCourseTopics.mockReturnValue(
      topicsQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 500, title: "Request failed" }),
        refetch,
      }),
    );

    renderPage();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.getByText("We couldn't load the course topics"),
    ).toBeVisible();
  });

  it("handles malformed course route IDs without requesting course topics", () => {
    renderPage("/teacher/courses/not-a-uuid/topics");

    expect(screen.getByText("Invalid course link")).toBeVisible();
    expect(mockedUseCourseTopics).toHaveBeenCalledWith(undefined);
  });
});
