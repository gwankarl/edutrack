import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TeacherLessonResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import {
  useReorderCourseTopics,
  useReorderTopicLessons,
} from "../hooks/useContentReordering.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import CourseContentTree from "./CourseContentTree.js";

vi.mock("../hooks/useCourseTopics.js", () => ({
  useCourseTopics: vi.fn(),
}));

vi.mock("../hooks/useTopicLessons.js", () => ({
  useTopicLessons: vi.fn(),
}));

vi.mock("../hooks/useContentReordering.js", () => ({
  useReorderCourseTopics: vi.fn(),
  useReorderTopicLessons: vi.fn(),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topics = [
  {
    id: "550e8400-e29b-41d4-a716-446655440021",
    courseId,
    title: "Linear equations",
    description: "An introduction to equations.",
    position: 1,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440022",
    courseId,
    title: "Inequalities",
    description: null,
    position: 2,
    createdAt: "2026-11-16T12:00:00.000Z",
    updatedAt: "2026-11-16T12:00:00.000Z",
  },
] satisfies TeacherTopicResponse[];

const lessons = [
  {
    id: "550e8400-e29b-41d4-a716-446655440023",
    topicId: topics[0].id,
    title: "Solving an equation",
    content: null,
    position: 1,
    createdAt: "2026-11-17T12:00:00.000Z",
    updatedAt: "2026-11-17T12:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440024",
    topicId: topics[0].id,
    title: "Checking a solution",
    content: null,
    position: 2,
    createdAt: "2026-11-18T12:00:00.000Z",
    updatedAt: "2026-11-18T12:00:00.000Z",
  },
] satisfies TeacherLessonResponse[];

const mockedUseCourseTopics = vi.mocked(useCourseTopics);
const mockedUseTopicLessons = vi.mocked(useTopicLessons);
const mockedUseReorderCourseTopics = vi.mocked(useReorderCourseTopics);
const mockedUseReorderTopicLessons = vi.mocked(useReorderTopicLessons);
let queryClient: QueryClient;

function reorderMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

function topicsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { items: topics },
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

function lessonsQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: { items: lessons },
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTopicLessons>;
}

function renderTree(canManage = true, initialEntry = "/") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CourseContentTree canManage={canManage} courseId={courseId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CourseContentTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockedUseCourseTopics.mockReturnValue(topicsQuery());
    mockedUseTopicLessons.mockReturnValue(lessonsQuery());
    mockedUseReorderCourseTopics.mockReturnValue(
      reorderMutation() as unknown as ReturnType<typeof useReorderCourseTopics>,
    );
    mockedUseReorderTopicLessons.mockReturnValue(
      reorderMutation() as unknown as ReturnType<typeof useReorderTopicLessons>,
    );
  });

  it("preserves the backend topic order and provides Draft topic actions", () => {
    renderTree();

    const expandButtons = screen.getAllByRole("button", {
      name: /Expand topic/,
    });
    expect(expandButtons[0]).toHaveAccessibleName(
      "Expand topic Linear equations",
    );
    expect(expandButtons[1]).toHaveAccessibleName("Expand topic Inequalities");
    expect(screen.getByRole("link", { name: "Add Topic" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/new`,
    );
    expect(mockedUseTopicLessons).not.toHaveBeenCalled();
  });

  it("loads lessons only after expanding a topic and preserves their order", async () => {
    const user = userEvent.setup();
    renderTree();

    const expandButton = screen.getByRole("button", {
      name: "Expand topic Linear equations",
    });
    await user.click(expandButton);

    expect(expandButton).toHaveAttribute("aria-expanded", "true");
    expect(mockedUseTopicLessons).toHaveBeenCalledWith(courseId, topics[0].id);

    const region = screen.getByRole("region", {
      name: "Expanded content for Linear equations",
    });
    const lessonSection = within(region).getByRole("region", {
      name: "Lessons (2)",
    });
    const lessonLinks = within(lessonSection).getAllByRole("link", {
      name: /Edit lesson/,
    });

    expect(lessonLinks[0]).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topics[0].id}/lessons/${lessons[0].id}`,
    );
    expect(lessonLinks[0]).toHaveTextContent("Solving an equation");
    expect(lessonLinks[1]).toHaveTextContent("Checking a solution");
    expect(within(lessonSection).getByText("Lessons (2)")).toBeVisible();
    expect(
      within(region).getByRole("heading", { name: /Quizzes/ }),
    ).toBeVisible();
  });

  it("hides Add Topic and Add Lesson actions for read-only courses", async () => {
    const user = userEvent.setup();
    renderTree(false);

    expect(screen.queryByRole("link", { name: "Add Topic" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "View topic: Linear equations" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(screen.queryByRole("link", { name: "Add Lesson" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /View lesson: Solving an equation/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Move/ })).toBeNull();
  });

  it("submits a complete topic order and disables boundary moves", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseReorderCourseTopics.mockReturnValue(
      reorderMutation({ mutate }) as unknown as ReturnType<
        typeof useReorderCourseTopics
      >,
    );

    renderTree();

    expect(
      screen.getByRole("button", { name: "Move topic Linear equations up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move topic Inequalities down" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Move topic Linear equations down" }),
    );

    expect(mutate).toHaveBeenCalledWith({
      topicIds: [topics[1].id, topics[0].id],
    });
  });

  it("keeps the expanded topic open after the reordered list updates", async () => {
    const user = userEvent.setup();
    const { rerender } = renderTree();

    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Move topic Linear equations down" }),
    );

    mockedUseCourseTopics.mockReturnValue(
      topicsQuery({ data: { items: [topics[1], topics[0]] } }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CourseContentTree canManage courseId={courseId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Collapse topic Linear equations",
        }),
      ).toHaveAttribute("aria-expanded", "true");
    });
    expect(
      screen.getByRole("region", {
        name: "Expanded content for Linear equations",
      }),
    ).toBeVisible();
  });

  it("shows topic reorder pending and conflict feedback accessibly", () => {
    mockedUseReorderCourseTopics.mockReturnValue(
      reorderMutation({ isPending: true }) as unknown as ReturnType<
        typeof useReorderCourseTopics
      >,
    );

    const { rerender } = renderTree();
    expect(screen.getByRole("status")).toHaveTextContent("Saving topic order");
    expect(
      screen.getByRole("button", {
        name: "Move topic Linear equations down",
      }),
    ).toBeDisabled();

    mockedUseReorderCourseTopics.mockReturnValue(
      reorderMutation({
        isError: true,
        error: new ApiError({ status: 409, title: "Conflict" }),
      }) as unknown as ReturnType<typeof useReorderCourseTopics>,
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CourseContentTree canManage courseId={courseId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The course is no longer a draft or the topics order changed",
    );
    expect(
      screen.getAllByRole("button", { name: /Expand topic/ })[0],
    ).toHaveAccessibleName("Expand topic Linear equations");
  });

  it("submits a complete lesson order and disables boundary moves", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockedUseReorderTopicLessons.mockReturnValue(
      reorderMutation({ mutate }) as unknown as ReturnType<
        typeof useReorderTopicLessons
      >,
    );

    renderTree();
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Move lesson Solving an equation up",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Move lesson Checking a solution down",
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Move lesson Checking a solution up",
      }),
    );

    expect(mutate).toHaveBeenCalledWith({
      lessonIds: [lessons[1].id, lessons[0].id],
    });
  });

  it("restores the topic expansion from the Course Content URL", async () => {
    renderTree(true, `/?tab=content&expandedTopicId=${topics[0].id}`);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Collapse topic Linear equations",
        }),
      ).toHaveAttribute("aria-expanded", "true");
    });
    expect(mockedUseTopicLessons).toHaveBeenCalledWith(courseId, topics[0].id);
  });

  it("shows an empty-course state and the Draft Add Topic action", () => {
    mockedUseCourseTopics.mockReturnValue(topicsQuery({ data: { items: [] } }));

    renderTree(true);

    expect(screen.getByRole("status")).toHaveTextContent(
      "This course has no topics yet.",
    );
    expect(screen.getByRole("link", { name: "Add Topic" })).toBeVisible();
  });

  it("shows loading and retry states for topics", async () => {
    const refetch = vi.fn();
    mockedUseCourseTopics.mockReturnValue(
      topicsQuery({
        data: undefined,
        isPending: true,
        isSuccess: false,
      }),
    );

    const { rerender } = renderTree();
    expect(screen.getByRole("status")).toHaveTextContent("Loading topics");

    mockedUseCourseTopics.mockReturnValue(
      topicsQuery({
        data: undefined,
        isPending: false,
        isError: true,
        isSuccess: false,
        error: new Error("network"),
        refetch,
      }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CourseContentTree canManage courseId={courseId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows lesson-empty and retry states after expansion", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockedUseTopicLessons.mockReturnValue(
      lessonsQuery({ data: { items: [] } }),
    );

    const { rerender } = renderTree();
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(
      screen.getByText(
        "This topic has no lessons yet. Add a lesson to start preparing its content.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add Lesson" })).toBeVisible();

    mockedUseTopicLessons.mockReturnValue(
      lessonsQuery({
        data: undefined,
        isError: true,
        isSuccess: false,
        error: new ApiError({ status: 409, title: "Conflict" }),
        refetch,
      }),
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CourseContentTree canManage courseId={courseId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const lessonSection = screen.getByRole("region", { name: "Lessons" });
    expect(within(lessonSection).getByRole("alert")).toHaveTextContent(
      "We couldn't load lessons for Linear equations",
    );
    await user.click(
      within(lessonSection).getByRole("button", { name: "Try again" }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });
});
