import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherCourseResponse,
  TeacherLessonResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useLesson } from "../hooks/useLesson.js";
import { useTopic } from "../hooks/useTopic.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import LessonEditorPage from "./LessonEditorPage.js";

vi.mock("../hooks/useLesson.js", () => ({ useLesson: vi.fn() }));
vi.mock("../hooks/useTopic.js", () => ({ useTopic: vi.fn() }));
vi.mock("../hooks/useTeacherCourse.js", () => ({ useTeacherCourse: vi.fn() }));
vi.mock("../components/LessonForm.js", () => ({
  default: ({
    initialLesson,
    onDirtyChange,
  }: {
    initialLesson?: TeacherLessonResponse;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <form
      aria-label={initialLesson ? "Edit lesson form" : "Create lesson form"}
    >
      {initialLesson ? "Edit lesson form" : "Create lesson form"}
      <button onClick={() => onDirtyChange?.(true)} type="button">
        Make unsaved change
      </button>
    </form>
  ),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const lessonId = "550e8400-e29b-41d4-a716-446655440022";

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
  updatedAt: "2026-11-15T12:00:00.000Z",
} satisfies TeacherTopicResponse;

const lesson = {
  id: lessonId,
  topicId,
  title: "Solving equations",
  content: {
    blocks: [
      { type: "paragraph", text: "Isolate the unknown." },
      { type: "paragraph", text: "Check the result." },
    ],
  },
  position: 4,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-16T12:00:00.000Z",
} satisfies TeacherLessonResponse;

const mockedUseLesson = vi.mocked(useLesson);
const mockedUseTopic = vi.mocked(useTopic);
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

function lessonQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: lesson,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useLesson>;
}

function renderPage(
  path = `/teacher/courses/${courseId}/topics/${topicId}/lessons/new`,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const router = createMemoryRouter(
    [
      {
        path: "/teacher/courses/:courseId/topics/:topicId/lessons/new",
        element: <LessonEditorPage />,
      },
      {
        path: "/teacher/courses/:courseId/topics/:topicId/lessons/:lessonId",
        element: <LessonEditorPage />,
      },
      {
        path: "/teacher/courses/:courseId",
        element: <p>Course workspace destination</p>,
      },
      {
        path: "/teacher/courses",
        element: <p>My courses destination</p>,
      },
    ],
    { initialEntries: [path] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("LessonEditorPage", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    mockedUseLesson.mockReset();
    mockedUseTopic.mockReset();
    mockedUseTeacherCourse.mockReset();
    mockedUseLesson.mockReturnValue(lessonQuery());
    mockedUseTopic.mockReturnValue(topicQuery());
    mockedUseTeacherCourse.mockReturnValue(courseQuery());
  });

  it("shows the parent course/topic and a creation form for Draft courses", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Create lesson", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Algebra Foundations", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Linear equations", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Linear equations" }),
    ).toHaveAttribute("href", `/teacher/courses/${courseId}/topics/${topicId}`);
    expect(screen.getByRole("link", { name: "Topics" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics`,
    );
    expect(
      screen.getByRole("form", { name: "Create lesson form" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to Course Content" }),
    ).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}?tab=content&expandedTopicId=${topicId}`,
    );
    expect(mockedUseLesson).toHaveBeenCalledWith(courseId, topicId, null);
  });

  it("shows the lesson title and position with the Draft edit form", () => {
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );

    expect(
      screen.getByRole("heading", { name: "Solving equations", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("Lesson 4")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Lesson information", level: 2 }),
    ).toBeVisible();
    expect(screen.queryByText("Isolate the unknown.")).toBeNull();
    expect(screen.queryByText("Check the result.")).toBeNull();
    expect(
      screen.getByRole("form", { name: "Edit lesson form" }),
    ).toBeVisible();
  });

  it("warns before leaving with unsaved lesson changes and allows cancellation or confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    await user.click(screen.getByRole("button", { name: "Make unsaved change" }));
    await user.click(screen.getByRole("link", { name: "My Courses" }));

    expect(confirm).toHaveBeenCalledWith(
      "You have unsaved lesson changes. Leave this page and discard them?",
    );
    expect(
      screen.getByRole("heading", { name: "Solving equations", level: 1 }),
    ).toBeVisible();

    await user.click(screen.getByRole("link", { name: "My Courses" }));
    expect(await screen.findByText("My courses destination")).toBeVisible();
  });

  it("renders lesson content as text and keeps non-Draft courses read-only", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "published" } }),
    );
    mockedUseLesson.mockReturnValue(
      lessonQuery({
        data: {
          ...lesson,
          content: {
            blocks: [{ type: "paragraph", text: "<script>alert(1)</script>" }],
          },
        },
      }),
    );
    const { container } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );

    expect(screen.getByText("This lesson is read-only")).toBeVisible();
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByRole("form", { name: "Edit lesson form" })).toBeNull();
  });

  it("blocks lesson creation when the course is not a Draft", () => {
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: { ...course, status: "pending_review" } }),
    );

    renderPage();

    expect(screen.getByText("Lessons are read-only")).toBeVisible();
    expect(
      screen.queryByRole("form", { name: "Create lesson form" }),
    ).toBeNull();
  });

  it("handles parent and lesson loading states", () => {
    mockedUseTopic.mockReturnValue(
      topicQuery({ data: undefined, isPending: true }),
    );
    const { unmount } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    expect(
      screen.getByText("Please wait while the parent topic loads."),
    ).toBeVisible();

    unmount();
    mockedUseTopic.mockReturnValue(topicQuery());
    mockedUseLesson.mockReturnValue(
      lessonQuery({ data: undefined, isPending: true }),
    );
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    expect(
      screen.getByText("Please wait while the lesson loads."),
    ).toBeVisible();
  });

  it("shows not-found, authorization, and retry states", async () => {
    mockedUseLesson.mockReturnValue(
      lessonQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 404, title: "Not found" }),
      }),
    );
    const { unmount } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    expect(
      screen.getByText("This lesson is not available to your account."),
    ).toBeVisible();

    unmount();
    mockedUseTeacherCourse.mockReturnValue(
      courseQuery({ data: undefined, authorizationStatus: "forbidden" }),
    );
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    expect(screen.getByText("Teacher access required")).toBeVisible();
  });

  it("offers retry after an API failure", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseLesson.mockReturnValue(
      lessonQuery({
        data: undefined,
        isError: true,
        error: new ApiError({ status: 500, title: "Request failed" }),
        refetch,
      }),
    );

    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessonId}`,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
