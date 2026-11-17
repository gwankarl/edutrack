import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuizEditorPage from "./QuizEditorPage.js";
import {
  useCreateTeacherQuiz,
  useCreateTeacherQuizQuestion,
  useReorderTeacherQuizQuestions,
  useTeacherQuiz,
  useTeacherQuizQuestions,
  useUpdateTeacherQuiz,
} from "../hooks/useQuizAuthoring.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import { useTopic } from "../hooks/useTopic.js";

vi.mock("../hooks/useTeacherCourse.js", () => ({ useTeacherCourse: vi.fn() }));
vi.mock("../hooks/useTopic.js", () => ({ useTopic: vi.fn() }));
vi.mock("../hooks/useQuizAuthoring.js", () => ({
  useCreateTeacherQuiz: vi.fn(),
  useCreateTeacherQuizQuestion: vi.fn(),
  useReorderTeacherQuizQuestions: vi.fn(),
  useTeacherQuiz: vi.fn(),
  useTeacherQuizQuestions: vi.fn(),
  useUpdateTeacherQuiz: vi.fn(),
  useCreateTeacherQuizOption: vi.fn(() => mutation()),
  useReorderTeacherQuizOptions: vi.fn(() => mutation()),
  useUpdateTeacherQuizOption: vi.fn(() => mutation()),
  useUpdateTeacherQuizQuestion: vi.fn(() => mutation()),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizId = "550e8400-e29b-41d4-a716-446655440022";
const questionId = "550e8400-e29b-41d4-a716-446655440023";
const originalConfirm = window.confirm;

const course = {
  id: courseId,
  title: "Algebra Foundations",
  description: null,
  academicLevel: {
    id: courseId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: topicId,
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft",
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
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

const quiz = {
  id: quizId,
  topicId,
  title: "Equation practice",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

const question = {
  id: questionId,
  quizId,
  questionText: "Solve for x",
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  options: [],
};

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
  };
}

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

const mocks = {
  createQuiz: vi.mocked(useCreateTeacherQuiz),
  updateQuiz: vi.mocked(useUpdateTeacherQuiz),
  createQuestion: vi.mocked(useCreateTeacherQuizQuestion),
  reorderQuestions: vi.mocked(useReorderTeacherQuizQuestions),
  quiz: vi.mocked(useTeacherQuiz),
  questions: vi.mocked(useTeacherQuizQuestions),
  course: vi.mocked(useTeacherCourse),
  topic: vi.mocked(useTopic),
};

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/teacher/courses/:courseId/topics/:topicId/quizzes/new",
        Component: QuizEditorPage,
      },
      {
        path: "/teacher/courses/:courseId/topics/:topicId/quizzes/:quizId",
        Component: QuizEditorPage,
      },
      { path: "*", element: <p>Content route</p> },
    ],
    { initialEntries: [path] },
  );

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  mocks.course.mockReturnValue(query(course) as never);
  mocks.topic.mockReturnValue(query(topic) as never);
  mocks.quiz.mockReturnValue(query(quiz) as never);
  mocks.questions.mockReturnValue(query({ items: [question] }) as never);
  mocks.createQuiz.mockReturnValue(
    mutation({
      mutateAsync: vi.fn().mockResolvedValue(quiz),
    }) as never,
  );
  mocks.updateQuiz.mockReturnValue(
    mutation({
      mutateAsync: vi.fn().mockResolvedValue(quiz),
    }) as never,
  );
  mocks.createQuestion.mockReturnValue(
    mutation({
      mutateAsync: vi.fn().mockResolvedValue(question),
    }) as never,
  );
  mocks.reorderQuestions.mockReturnValue(mutation() as never);
});

afterEach(() => {
  window.confirm = originalConfirm;
});

describe("QuizEditorPage", () => {
  it("creates a quiz from supported details and preserves the topic return link", async () => {
    const user = userEvent.setup();
    const { router } = renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/new`,
    );

    await user.type(screen.getByLabelText("Quiz title"), "Equation practice");
    await user.type(
      screen.getByLabelText("Description (optional)"),
      "Practice",
    );
    await user.click(screen.getByRole("button", { name: "Create quiz" }));

    await waitFor(() => {
      expect(
        mocks.createQuiz.mock.results[0]?.value.mutateAsync,
      ).toHaveBeenCalledWith({
        title: "Equation practice",
        description: "Practice",
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quiz.id}`,
      );
    });
  });

  it("updates existing quiz details with the supported fields", async () => {
    const update = mutation({
      mutateAsync: vi.fn().mockResolvedValue({
        ...quiz,
        title: "Updated quiz",
        description: "Updated details",
      }),
    });
    mocks.updateQuiz.mockReturnValue(update as never);
    const user = userEvent.setup();
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
    );

    await user.clear(screen.getByLabelText("Quiz title"));
    await user.type(screen.getByLabelText("Quiz title"), "Updated quiz");
    await user.clear(screen.getByLabelText("Description (optional)"));
    await user.type(
      screen.getByLabelText("Description (optional)"),
      "Updated details",
    );
    await user.click(screen.getByRole("button", { name: "Save quiz details" }));

    await waitFor(() => {
      expect(update.mutateAsync).toHaveBeenCalledWith({
        title: "Updated quiz",
        description: "Updated details",
      });
    });
  });

  it("shows questions in backend order and allows incremental question creation", async () => {
    const user = userEvent.setup();
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
    );

    expect(screen.getByText("Question 1")).toBeVisible();
    await user.type(screen.getByLabelText("New question text"), "Add a second");
    await user.click(screen.getByRole("button", { name: "Add question" }));

    await waitFor(() => {
      expect(
        mocks.createQuestion.mock.results[0]?.value.mutateAsync,
      ).toHaveBeenCalledWith({
        questionText: "Add a second",
      });
    });
  });

  it("shows read-only quiz details when the course is not Draft", () => {
    mocks.course.mockReturnValue(
      query({ ...course, status: "published" }) as never,
    );
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
    );

    expect(
      screen.getByRole("heading", { name: "Equation practice" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add question" })).toBeNull();
    expect(
      screen.getByText(/read-only because it is not a draft/i),
    ).toBeVisible();
  });

  it("shows the question empty state and quiz loading/error states", () => {
    mocks.questions.mockReturnValue(
      query(undefined, { isPending: true, isSuccess: false }) as never,
    );
    renderPage(
      `/teacher/courses/${courseId}/topics/${topicId}/quizzes/${quizId}`,
    );
    expect(screen.getByText("Loading questions…")).toBeVisible();
  });
});
