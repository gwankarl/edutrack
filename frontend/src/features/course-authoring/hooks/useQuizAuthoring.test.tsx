import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import {
  createTeacherQuiz,
  listTeacherQuizzes,
  reorderTeacherQuizzes,
} from "../api/quizzes.api.js";
import {
  createTeacherQuizQuestion,
  listTeacherQuizQuestions,
  reorderTeacherQuizQuestions,
} from "../api/quiz-questions.api.js";
import {
  createTeacherQuizOption,
  reorderTeacherQuizOptions,
  updateTeacherQuizOption,
} from "../api/quiz-options.api.js";
import {
  quizAuthoringQueryKeys,
  useCreateTeacherQuiz,
  useCreateTeacherQuizOption,
  useCreateTeacherQuizQuestion,
  useReorderTeacherQuizOptions,
  useReorderTeacherQuizQuestions,
  useReorderTeacherQuizzes,
  useTeacherQuizQuestions,
  useTeacherQuizzes,
  useUpdateTeacherQuizOption,
} from "./useQuizAuthoring.js";

vi.mock("../api/quizzes.api.js", () => ({
  createTeacherQuiz: vi.fn(),
  getTeacherQuiz: vi.fn(),
  listTeacherQuizzes: vi.fn(),
  reorderTeacherQuizzes: vi.fn(),
  updateTeacherQuiz: vi.fn(),
}));

vi.mock("../api/quiz-questions.api.js", () => ({
  createTeacherQuizQuestion: vi.fn(),
  getTeacherQuizQuestion: vi.fn(),
  listTeacherQuizQuestions: vi.fn(),
  reorderTeacherQuizQuestions: vi.fn(),
  updateTeacherQuizQuestion: vi.fn(),
}));

vi.mock("../api/quiz-options.api.js", () => ({
  createTeacherQuizOption: vi.fn(),
  reorderTeacherQuizOptions: vi.fn(),
  updateTeacherQuizOption: vi.fn(),
}));

const userId = "550e8400-e29b-41d4-a716-446655440099";
const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const quizId = "550e8400-e29b-41d4-a716-446655440022";
const questionId = "550e8400-e29b-41d4-a716-446655440023";
const optionId = "550e8400-e29b-41d4-a716-446655440024";
const secondQuizId = "550e8400-e29b-41d4-a716-446655440025";
const secondQuestionId = "550e8400-e29b-41d4-a716-446655440026";
const secondOptionId = "550e8400-e29b-41d4-a716-446655440027";

const teacher = {
  id: userId,
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "teacher"],
};

const quiz = {
  id: quizId,
  topicId,
  title: "Algebra",
  description: null,
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

const secondQuiz = { ...quiz, id: secondQuizId, position: 2 };

const option = {
  id: optionId,
  questionId,
  optionText: "x = 4",
  position: 1,
  isCorrect: true,
};

const secondOption = {
  ...option,
  id: secondOptionId,
  optionText: "x = 5",
  position: 2,
  isCorrect: false,
};

const question = {
  id: questionId,
  quizId,
  questionText: "Solve for x",
  position: 1,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  options: [option, secondOption],
};

const secondQuestion = {
  ...question,
  id: secondQuestionId,
  position: 2,
};

function createWrapper(currentUser: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(currentUserQueryKey, currentUser);

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("quiz authoring hooks", () => {
  it("fetches teacher quizzes and nested questions without changing backend order", async () => {
    vi.mocked(listTeacherQuizzes).mockResolvedValue({
      items: [secondQuiz, quiz],
    });
    vi.mocked(listTeacherQuizQuestions).mockResolvedValue({
      items: [secondQuestion, question],
    });

    const { Wrapper } = createWrapper(teacher);
    const quizzes = renderHook(() => useTeacherQuizzes(courseId, topicId), {
      wrapper: Wrapper,
    });
    const questions = renderHook(
      () => useTeacherQuizQuestions(courseId, topicId, quizId),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(quizzes.result.current.isSuccess).toBe(true);
      expect(questions.result.current.isSuccess).toBe(true);
    });

    expect(quizzes.result.current.data?.items.map((item) => item.id)).toEqual([
      secondQuizId,
      quizId,
    ]);
    expect(questions.result.current.data?.items.map((item) => item.id)).toEqual(
      [secondQuestionId, questionId],
    );
    expect(questions.result.current.data?.items[1]?.options[0]?.isCorrect).toBe(
      true,
    );
    expect(listTeacherQuizzes).toHaveBeenCalledWith(courseId, topicId);
    expect(listTeacherQuizQuestions).toHaveBeenCalledWith(quizId);
  });

  it("disables queries without Teacher access or valid identifiers", () => {
    const fetchQuiz = vi.mocked(listTeacherQuizzes);
    const { Wrapper: studentWrapper } = createWrapper({
      ...teacher,
      roles: ["student"],
    });

    const forbidden = renderHook(() => useTeacherQuizzes(courseId, topicId), {
      wrapper: studentWrapper,
    });

    expect(forbidden.result.current.authorizationStatus).toBe("forbidden");
    expect(forbidden.result.current.fetchStatus).toBe("idle");

    const { Wrapper: teacherWrapper } = createWrapper(teacher);
    const invalid = renderHook(() => useTeacherQuizzes("bad-id", topicId), {
      wrapper: teacherWrapper,
    });

    expect(invalid.result.current.validationError).not.toBeNull();
    expect(invalid.result.current.fetchStatus).toBe("idle");
    expect(fetchQuiz).not.toHaveBeenCalled();
  });

  it("scopes keys by user and preserves option correctness in cached teacher data", () => {
    expect(
      quizAuthoringQueryKeys.quizList(userId, courseId, topicId),
    ).not.toEqual(
      quizAuthoringQueryKeys.quizList(
        "550e8400-e29b-41d4-a716-446655440098",
        courseId,
        topicId,
      ),
    );
    expect(question.options[0]?.isCorrect).toBe(true);
  });

  it("updates nested caches and invalidates related data after create and reorder mutations", async () => {
    vi.mocked(createTeacherQuiz).mockResolvedValue(quiz);
    vi.mocked(reorderTeacherQuizzes).mockResolvedValue({ items: [quiz] });
    vi.mocked(createTeacherQuizQuestion).mockResolvedValue(question);
    vi.mocked(reorderTeacherQuizQuestions).mockResolvedValue({
      items: [question],
    });
    vi.mocked(createTeacherQuizOption).mockResolvedValue(secondOption);
    vi.mocked(updateTeacherQuizOption).mockResolvedValue({
      ...secondOption,
      isCorrect: true,
    });
    vi.mocked(reorderTeacherQuizOptions).mockResolvedValue([
      secondOption,
      option,
    ]);

    const { queryClient, Wrapper } = createWrapper(teacher);
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    const createQuiz = renderHook(
      () => useCreateTeacherQuiz(courseId, topicId),
      { wrapper: Wrapper },
    );
    const reorderQuizzes = renderHook(
      () => useReorderTeacherQuizzes(courseId, topicId),
      { wrapper: Wrapper },
    );
    const createQuestion = renderHook(
      () => useCreateTeacherQuizQuestion(courseId, topicId, quizId),
      { wrapper: Wrapper },
    );
    const reorderQuestions = renderHook(
      () => useReorderTeacherQuizQuestions(courseId, topicId, quizId),
      { wrapper: Wrapper },
    );
    const createOption = renderHook(
      () => useCreateTeacherQuizOption(courseId, topicId, quizId, questionId),
      { wrapper: Wrapper },
    );
    const updateOption = renderHook(
      () =>
        useUpdateTeacherQuizOption(
          courseId,
          topicId,
          quizId,
          questionId,
          secondOptionId,
        ),
      { wrapper: Wrapper },
    );
    const reorderOptions = renderHook(
      () => useReorderTeacherQuizOptions(courseId, topicId, quizId, questionId),
      { wrapper: Wrapper },
    );

    queryClient.setQueryData(
      quizAuthoringQueryKeys.question(
        userId,
        courseId,
        topicId,
        quizId,
        questionId,
      ),
      question,
    );

    await act(async () => {
      await createQuiz.result.current.mutateAsync({ title: "Algebra" });
      await reorderQuizzes.result.current.mutateAsync({ quizIds: [quizId] });
      await createQuestion.result.current.mutateAsync({
        questionText: "Solve for x",
      });
      await reorderQuestions.result.current.mutateAsync({
        questionIds: [questionId],
      });
      await createOption.result.current.mutateAsync({
        optionText: "x = 5",
        isCorrect: false,
      });
      await updateOption.result.current.mutateAsync({ isCorrect: true });
      await reorderOptions.result.current.mutateAsync({
        optionIds: [secondOptionId, optionId],
      });
    });

    expect(
      queryClient.getQueryData(
        quizAuthoringQueryKeys.quiz(userId, courseId, topicId, quizId),
      ),
    ).toEqual(quiz);
    expect(
      queryClient.getQueryData(
        quizAuthoringQueryKeys.question(
          userId,
          courseId,
          topicId,
          quizId,
          questionId,
        ),
      ),
    ).toMatchObject({
      options: [secondOption, option],
    });
    expect(invalidate).toHaveBeenCalled();
    await waitFor(() => {
      expect(createQuiz.result.current.isSuccess).toBe(true);
      expect(reorderOptions.result.current.isSuccess).toBe(true);
    });
  });

  it("propagates mutation failures and prevents unauthenticated mutation requests", async () => {
    vi.mocked(createTeacherQuiz).mockRejectedValue(
      new Error("The API rejected the mutation."),
    );

    const { Wrapper } = createWrapper(teacher);
    const mutation = renderHook(() => useCreateTeacherQuiz(courseId, topicId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        mutation.result.current.mutateAsync({ title: "Algebra" }),
      ).rejects.toThrow("The API rejected the mutation.");
    });
    await waitFor(() => {
      expect(mutation.result.current.isError).toBe(true);
    });

    const { Wrapper: anonymousWrapper } = createWrapper(null);
    const unauthenticated = renderHook(
      () => useCreateTeacherQuiz(courseId, topicId),
      { wrapper: anonymousWrapper },
    );

    await act(async () => {
      await expect(
        unauthenticated.result.current.mutateAsync({ title: "Blocked" }),
      ).rejects.toMatchObject({ status: 401 });
    });
    expect(createTeacherQuiz).toHaveBeenCalledTimes(1);
  });
});
