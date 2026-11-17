import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CourseContentTree from "./CourseContentTree.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import {
  useReorderCourseTopics,
  useReorderTopicLessons,
} from "../hooks/useContentReordering.js";
import {
  useReorderTeacherQuizzes,
  useTeacherQuizzes,
} from "../hooks/useQuizAuthoring.js";

vi.mock("../hooks/useCourseTopics.js", () => ({ useCourseTopics: vi.fn() }));
vi.mock("../hooks/useTopicLessons.js", () => ({ useTopicLessons: vi.fn() }));
vi.mock("../hooks/useContentReordering.js", () => ({
  useReorderCourseTopics: vi.fn(),
  useReorderTopicLessons: vi.fn(),
}));
vi.mock("../hooks/useQuizAuthoring.js", () => ({
  useTeacherQuizzes: vi.fn(),
  useReorderTeacherQuizzes: vi.fn(),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizA = {
  id: "550e8400-e29b-41d4-a716-446655440022",
  topicId,
  title: "First quiz",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};
const quizB = {
  ...quizA,
  id: "550e8400-e29b-41d4-a716-446655440023",
  title: "Second quiz",
  position: 2,
};
const topic = {
  id: topicId,
  courseId,
  title: "Linear equations",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

const mockedTopics = vi.mocked(useCourseTopics);
const mockedLessons = vi.mocked(useTopicLessons);
const mockedQuizList = vi.mocked(useTeacherQuizzes);
const mockedReorderQuizzes = vi.mocked(useReorderTeacherQuizzes);

function query(data: unknown, overrides: Record<string, unknown> = {}) {
  return {
    data,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    isSuccess: true,
    authorizationStatus: "authorized",
    validationError: null,
    refetch: vi.fn(),
    ...overrides,
  } as never;
}
function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  } as never;
}
function renderTree(canManage = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CourseContentTree canManage={canManage} courseId={courseId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTopics.mockReturnValue(query({ items: [topic] }));
  mockedLessons.mockReturnValue(query({ items: [] }));
  mockedQuizList.mockReturnValue(query({ items: [quizA, quizB] }));
  mockedReorderQuizzes.mockReturnValue(mutation());
  vi.mocked(useReorderCourseTopics).mockReturnValue(mutation());
  vi.mocked(useReorderTopicLessons).mockReturnValue(mutation());
});

describe("CourseContentTree quiz authoring", () => {
  it("fetches quizzes only when the topic expands and shows ordered quiz links", async () => {
    const user = userEvent.setup();
    renderTree();

    expect(mockedQuizList).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(mockedQuizList).toHaveBeenCalledWith(courseId, topicId);
    const section = screen.getByRole("region", {
      name: "Expanded content for Linear equations",
    });
    const links = within(section).getAllByRole("link", { name: /Open quiz/ });
    expect(links[0]).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizA.id}?tab=content&expandedTopicId=${topicId}`,
    );
    expect(links[1]).toHaveTextContent("Second quiz");
    expect(screen.getByRole("link", { name: "Add Quiz" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/new?tab=content&expandedTopicId=${topicId}`,
    );
  });

  it("reorders quizzes using the complete ordered ID list and disables edge moves", async () => {
    const mutate = vi.fn();
    mockedReorderQuizzes.mockReturnValue(mutation({ mutate }));
    const user = userEvent.setup();
    renderTree();
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(
      screen.getByRole("button", { name: "Move quiz First quiz up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move quiz Second quiz down" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Move quiz First quiz down" }),
    );
    expect(mutate).toHaveBeenCalledWith({ quizIds: [quizB.id, quizA.id] });
  });

  it("hides quiz creation and reordering actions for a read-only course", async () => {
    const user = userEvent.setup();
    renderTree(false);
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(screen.queryByRole("link", { name: "Add Quiz" })).toBeNull();
    expect(
      screen.getByRole("link", { name: /View quiz: First quiz/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Move quiz/ })).toBeNull();
  });

  it("shows quiz loading, errors, and empty results", async () => {
    const user = userEvent.setup();
    mockedQuizList.mockReturnValue(
      query(undefined, { isPending: true, isSuccess: false }),
    );
    renderTree();
    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );
    expect(screen.getByText("Loading quizzes…")).toBeVisible();
  });

  it("allows retry after a quiz-list error", async () => {
    const retry = vi.fn();
    mockedQuizList.mockReturnValue(
      query(undefined, {
        isError: true,
        isPending: false,
        isSuccess: false,
        refetch: retry,
      }),
    );
    const user = userEvent.setup();
    renderTree();

    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn’t load quizzes/i,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows the read-only empty quiz state", async () => {
    mockedQuizList.mockReturnValue(query({ items: [] }));
    const user = userEvent.setup();
    renderTree(false);

    await user.click(
      screen.getByRole("button", { name: "Expand topic Linear equations" }),
    );

    expect(
      screen.getByText("This topic does not have any quizzes."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add Quiz" })).toBeNull();
  });
});
