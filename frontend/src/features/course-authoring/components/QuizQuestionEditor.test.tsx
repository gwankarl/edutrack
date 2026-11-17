import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuizQuestionEditor from "./QuizQuestionEditor.js";
import {
  useCreateTeacherQuizOption,
  useReorderTeacherQuizOptions,
  useUpdateTeacherQuizOption,
  useUpdateTeacherQuizQuestion,
} from "../hooks/useQuizAuthoring.js";

vi.mock("../hooks/useQuizAuthoring.js", () => ({
  useCreateTeacherQuizOption: vi.fn(),
  useReorderTeacherQuizOptions: vi.fn(),
  useUpdateTeacherQuizOption: vi.fn(),
  useUpdateTeacherQuizQuestion: vi.fn(),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizId = "550e8400-e29b-41d4-a716-446655440022";
const questionId = "550e8400-e29b-41d4-a716-446655440023";
const optionAId = "550e8400-e29b-41d4-a716-446655440024";
const optionBId = "550e8400-e29b-41d4-a716-446655440025";

const question = {
  id: questionId,
  quizId,
  questionText: "Solve for x",
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  options: [
    {
      id: optionAId,
      questionId,
      optionText: "x = 2",
      position: 1,
      isCorrect: true,
      createdAt: "2026-11-15T12:00:00.000Z",
      updatedAt: "2026-11-15T12:00:00.000Z",
    },
    {
      id: optionBId,
      questionId,
      optionText: "x = 3",
      position: 2,
      isCorrect: false,
      createdAt: "2026-11-15T12:00:00.000Z",
      updatedAt: "2026-11-15T12:00:00.000Z",
    },
  ],
};

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

const hooks = {
  createOption: vi.mocked(useCreateTeacherQuizOption),
  reorderOptions: vi.mocked(useReorderTeacherQuizOptions),
  updateOption: vi.mocked(useUpdateTeacherQuizOption),
  updateQuestion: vi.mocked(useUpdateTeacherQuizQuestion),
};

function renderEditor(canEdit = true, questionData = question) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QuizQuestionEditor
          canEdit={canEdit}
          courseId={courseId}
          index={0}
          isReorderingQuestions={false}
          onDirtyChange={vi.fn()}
          onMoveQuestion={vi.fn()}
          question={questionData}
          questionCount={1}
          quizId={quizId}
          topicId={topicId}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.createOption.mockReturnValue(mutation() as never);
  hooks.reorderOptions.mockReturnValue(mutation() as never);
  hooks.updateOption.mockReturnValue(mutation() as never);
  hooks.updateQuestion.mockReturnValue(mutation() as never);
});

describe("QuizQuestionEditor", () => {
  it("adds answer options incrementally as incomplete, incorrect options", async () => {
    const createMutation = mutation();
    hooks.createOption.mockReturnValue(createMutation as never);
    const user = userEvent.setup();
    renderEditor(true, {
      ...question,
      options: question.options.map((option) => ({
        ...option,
        isCorrect: false,
      })),
    });

    await user.type(
      screen.getByRole("textbox", { name: "New answer option for question 1" }),
      "x = 4",
    );
    await user.click(screen.getByRole("button", { name: "Add option" }));

    await waitFor(() => {
      expect(createMutation.mutateAsync).toHaveBeenCalledWith({
        optionText: "x = 4",
        isCorrect: false,
      });
    });
    expect(screen.getByText(/Draft incomplete:/i)).toBeVisible();
  });

  it("selects the correct answer through the authorized option update mutation", async () => {
    const updateMutation = mutation();
    hooks.updateOption.mockReturnValue(updateMutation as never);
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("radio", { name: "Correct answer for option 2" }),
    );

    await waitFor(() => {
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        isCorrect: true,
      });
    });
  });

  it("reorders options using the full ordered ID array and disables boundary moves", async () => {
    const reorderMutation = mutation();
    hooks.reorderOptions.mockReturnValue(reorderMutation as never);
    const user = userEvent.setup();
    renderEditor();

    expect(
      screen.getByRole("button", { name: "Move option 1 up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move option 2 down" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Move option 1 down" }),
    );

    expect(reorderMutation.mutate).toHaveBeenCalledWith({
      optionIds: [optionBId, optionAId],
    });
  });

  it("saves question edits and presents incomplete draft readiness guidance", async () => {
    const updateMutation = mutation();
    hooks.updateQuestion.mockReturnValue(updateMutation as never);
    const user = userEvent.setup();
    renderEditor();

    const textbox = screen.getByRole("textbox", { name: "Question text" });
    await user.clear(textbox);
    await user.type(textbox, "What is 2 + 2?");
    await user.click(screen.getByRole("button", { name: "Save question" }));

    await waitFor(() => {
      expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
        questionText: "What is 2 + 2?",
      });
    });
  });

  it("announces invalid empty question and option text without sending mutations", async () => {
    const updateQuestion = mutation();
    const updateOption = mutation();
    hooks.updateQuestion.mockReturnValue(updateQuestion as never);
    hooks.updateOption.mockReturnValue(updateOption as never);
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByRole("textbox", { name: "Question text" }));
    await user.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText(/too small|at least 1/i)).toHaveAttribute(
      "role",
      "alert",
    );
    expect(updateQuestion.mutateAsync).not.toHaveBeenCalled();

    await user.clear(screen.getByRole("textbox", { name: "Option 1" }));
    await user.click(
      screen.getAllByRole("button", { name: "Save option" })[0]!,
    );
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(updateOption.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps question and options read-only for non-Draft courses", () => {
    renderEditor(false);

    expect(
      screen.getByRole("textbox", { name: "Question text" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Option 1" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add option" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Move option/ })).toBeNull();
    expect(
      screen
        .getAllByRole("radio", { name: /Correct answer/ })
        .every((radio) => radio.hasAttribute("disabled")),
    ).toBe(true);
  });
});
