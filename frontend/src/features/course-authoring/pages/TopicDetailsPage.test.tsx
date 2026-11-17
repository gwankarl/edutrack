import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import { useTopic } from "../hooks/useTopic.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import TopicDetailsPage from "./TopicDetailsPage.js";

vi.mock("../hooks/useTopic.js", () => ({ useTopic: vi.fn() }));
vi.mock("../hooks/useTopicLessons.js", () => ({ useTopicLessons: vi.fn() }));
vi.mock("../hooks/useTeacherCourse.js", () => ({ useTeacherCourse: vi.fn() }));
vi.mock("../components/TopicForm.js", () => ({
  default: ({ initialTopic }: { initialTopic?: TeacherTopicResponse }) => (
    <form aria-label={initialTopic ? "Edit topic form" : "Create topic form"}>
      {initialTopic ? "Edit topic form" : "Create topic form"}
    </form>
  ),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const course = {
  id: courseId,
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

const topic = {
  id: topicId,
  courseId,
  title: "Linear equations",
  description: "An introduction to equations.",
  position: 2,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:00:00.000Z",
} satisfies TeacherTopicResponse;

const mockedUseTopic = vi.mocked(useTopic);
const mockedUseTopicLessons = vi.mocked(useTopicLessons);
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

function topicQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: topic,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTopic>;
}

function lessonsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { items: [] },
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTopicLessons>;
}

function renderPage(path = `/teacher/courses/${courseId}/topics/new`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            element={<TopicDetailsPage />}
            path="/teacher/courses/:courseId/topics/new"
          />
          <Route
            element={<TopicDetailsPage />}
            path="/teacher/courses/:courseId/topics/:topicId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TopicDetailsPage", () => {
  beforeEach(() => {
    mockedUseTopic.mockReset();
    mockedUseTopicLessons.mockReset();
    mockedUseTeacherCourse.mockReset();
    mockedUseTopic.mockReturnValue(topicQuery());
    mockedUseTopicLessons.mockReturnValue(lessonsQuery());
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
  });

  it("shows a Draft course and creation form with a back link", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Create topic", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Algebra Foundations", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics`,
    );
    expect(
      screen.getByRole("form", { name: "Create topic form" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Course Content" }),
    ).toHaveAttribute("href", `/teacher/courses/${courseId}?tab=content`);
    expect(mockedUseTopic).toHaveBeenCalledWith(courseId, null);
  });

  it("shows topic details and the edit form for a Draft topic", () => {
    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);

    expect(
      screen.getByRole("heading", { name: "Topic details", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Algebra Foundations" }),
    ).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}?tab=content&expandedTopicId=${topicId}`,
    );
    expect(
      screen.getByRole("link", { name: "Back to Course Content" }),
    ).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}?tab=content&expandedTopicId=${topicId}`,
    );
    expect(screen.getByText("An introduction to equations.")).toBeVisible();
    expect(screen.getByText("Topic 2")).toBeVisible();
    expect(screen.getByRole("form", { name: "Edit topic form" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Lessons" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Add Lesson" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/new`,
    );
  });

  it("keeps non-Draft topic details read-only", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "pending_review" } }),
    );

    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);

    expect(
      screen.getByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeVisible();
    expect(screen.getByText("This topic is read-only")).toBeVisible();
    expect(screen.queryByRole("form", { name: "Edit topic form" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Add Lesson" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /view or edit lesson/i }),
    ).toBeNull();
  });

  it("rejects creation for a non-Draft course", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "published" } }),
    );

    renderPage();

    expect(screen.getByText("Topics are read-only")).toBeVisible();
    expect(
      screen.queryByRole("form", { name: "Create topic form" }),
    ).toBeNull();
  });

  it("shows loading and invalid/not-found states", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, isPending: true }),
    );
    const { unmount } = renderPage();
    expect(
      screen.getByText("Please wait while the course loads."),
    ).toBeVisible();

    unmount();
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
    mockedUseTopic.mockReturnValue(
      topicQuery({ data: undefined, isPending: true }),
    );
    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);
    expect(
      screen.getByText("Please wait while the topic loads."),
    ).toBeVisible();
  });

  it("conceals not-found topics and offers a retry for server errors", async () => {
    mockedUseTopic.mockReturnValue(
      topicQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 404, title: "Not found" }),
      }),
    );
    const { unmount } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}`,
    );
    expect(
      screen.getByText("The course or topic is not available to your account."),
    ).toBeVisible();

    unmount();
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseTopic.mockReturnValue(
      topicQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 500, title: "Failure" }),
        refetch,
      }),
    );
    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows an access-denied state without rendering topic data", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, authorizationStatus: "forbidden" }),
    );

    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);

    expect(screen.getByText("Teacher access required")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeNull();
  });

  it("handles lesson loading and failures independently from topic details", async () => {
    mockedUseTopicLessons.mockReturnValue(
      lessonsQuery({ data: undefined, isPending: true }),
    );
    const { unmount } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}`,
    );
    expect(
      screen.getByText("Please wait while this topic's lessons load."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeVisible();

    unmount();
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseTopicLessons.mockReturnValue(
      lessonsQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 500, title: "Request failed" }),
        refetch,
      }),
    );
    renderPage(`/teacher/courses/${courseId}/topics/${topicId}`);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeVisible();
  });
});
