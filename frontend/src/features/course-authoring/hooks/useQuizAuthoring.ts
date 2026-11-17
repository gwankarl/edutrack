import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTeacherQuizOptionRequest,
  CreateTeacherQuizQuestionRequest,
  CreateTeacherQuizRequest,
  ReorderTeacherQuizOptionsRequest,
  ReorderTeacherQuizQuestionsRequest,
  ReorderTeacherQuizzesRequest,
  TeacherQuizQuestionResponse,
  UpdateTeacherQuizOptionRequest,
  UpdateTeacherQuizQuestionRequest,
  UpdateTeacherQuizRequest,
} from "@edutrack/contracts";
import {
  teacherQuizQuestionParamsSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
} from "@edutrack/contracts";
import { z } from "zod";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import {
  createTeacherQuiz,
  getTeacherQuiz,
  listTeacherQuizzes,
  reorderTeacherQuizzes,
  updateTeacherQuiz,
} from "../api/quizzes.api.js";
import {
  createTeacherQuizQuestion,
  getTeacherQuizQuestion,
  listTeacherQuizQuestions,
  reorderTeacherQuizQuestions,
  updateTeacherQuizQuestion,
} from "../api/quiz-questions.api.js";
import {
  createTeacherQuizOption,
  reorderTeacherQuizOptions,
  updateTeacherQuizOption,
} from "../api/quiz-options.api.js";
import { courseContentQueryKeys } from "./useCourseTopics.js";
import {
  getTeacherAccessStatus,
  requireTeacherId,
  shouldRetryCourseQuery,
} from "./useTeacherCourses.js";

export const quizAuthoringQueryKeys = {
  root: (userId: string | null) =>
    [
      "course-authoring",
      "courses",
      userId,
      "content",
      "quiz-authoring",
    ] as const,

  topic: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) => [...quizAuthoringQueryKeys.root(userId), courseId, topicId] as const,

  quizLists: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.topic(userId, courseId, topicId),
      "list",
    ] as const,

  quizList: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [...quizAuthoringQueryKeys.quizLists(userId, courseId, topicId)] as const,

  quizDetails: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.topic(userId, courseId, topicId),
      "detail",
    ] as const,

  quiz: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    quizId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.quizDetails(userId, courseId, topicId),
      quizId,
    ] as const,

  questions: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    quizId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.quiz(userId, courseId, topicId, quizId),
      "questions",
    ] as const,

  questionList: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    quizId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.questions(userId, courseId, topicId, quizId),
      "list",
    ] as const,

  questionDetails: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    quizId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.questions(userId, courseId, topicId, quizId),
      "detail",
    ] as const,

  question: (
    userId: string | null,
    courseId: string | null,
    topicId: string | null,
    quizId: string | null,
    questionId: string | null,
  ) =>
    [
      ...quizAuthoringQueryKeys.questionDetails(
        userId,
        courseId,
        topicId,
        quizId,
      ),
      questionId,
    ] as const,
};

function useTeacherScope() {
  const currentUser = useCurrentUser();
  const authorizationStatus = getTeacherAccessStatus(currentUser);
  const userId =
    authorizationStatus === "authorized" ? requireTeacherId(currentUser) : null;

  return { currentUser, authorizationStatus, userId };
}

function requireParsed<T>(
  parsed: { success: true; data: T } | { success: false; error: Error },
): T {
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

async function invalidateTopicQuizData(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  courseId: string,
  topicId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.quizList(userId, courseId, topicId),
    }),
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.quizDetails(userId, courseId, topicId),
    }),
    queryClient.invalidateQueries({
      queryKey: courseContentQueryKeys.topic(userId, courseId, topicId),
    }),
    queryClient.invalidateQueries({
      queryKey: courseContentQueryKeys.topicList(userId, courseId),
    }),
  ]);
}

async function invalidateQuestionData(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  courseId: string,
  topicId: string,
  quizId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.questionList(
        userId,
        courseId,
        topicId,
        quizId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.questionDetails(
        userId,
        courseId,
        topicId,
        quizId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.quiz(userId, courseId, topicId, quizId),
    }),
  ]);
}

async function invalidateQuestionAndOptionData(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  courseId: string,
  topicId: string,
  quizId: string,
  questionId: string,
) {
  await Promise.all([
    invalidateQuestionData(queryClient, userId, courseId, topicId, quizId),
    queryClient.invalidateQueries({
      queryKey: quizAuthoringQueryKeys.question(
        userId,
        courseId,
        topicId,
        quizId,
        questionId,
      ),
    }),
  ]);
}

export function useTeacherQuizzes(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const parsed = teacherTopicQuizCollectionParamsSchema.safeParse({
    courseId,
    topicId,
  });
  const validCourseId = parsed.success ? parsed.data.courseId : null;
  const validTopicId = parsed.success ? parsed.data.topicId : null;

  const query = useQuery({
    queryKey: quizAuthoringQueryKeys.quizList(
      userId,
      validCourseId,
      validTopicId,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return listTeacherQuizzes(params.courseId, params.topicId);
    },
    enabled: userId !== null && parsed.success,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useTeacherQuiz(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const parsed = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const params = parsed.success ? parsed.data : null;

  const query = useQuery({
    queryKey: quizAuthoringQueryKeys.quiz(
      userId,
      params?.courseId ?? null,
      params?.topicId ?? null,
      params?.quizId ?? null,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      const validParams = requireParsed(parsed);
      return getTeacherQuiz(
        validParams.courseId,
        validParams.topicId,
        validParams.quizId,
      );
    },
    enabled: userId !== null && params !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useCreateTeacherQuiz(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsed = teacherTopicQuizCollectionParamsSchema.safeParse({
    courseId,
    topicId,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateTeacherQuizRequest) => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return createTeacherQuiz(params.courseId, params.topicId, input);
    },
    onSuccess: async (quiz) => {
      if (!userId || !parsed.success) return;

      queryClient.setQueryData(
        quizAuthoringQueryKeys.quiz(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
          quiz.id,
        ),
        quiz,
      );
      await invalidateTopicQuizData(
        queryClient,
        userId,
        parsed.data.courseId,
        parsed.data.topicId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useUpdateTeacherQuiz(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsed = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateTeacherQuizRequest) => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return updateTeacherQuiz(
        params.courseId,
        params.topicId,
        params.quizId,
        input,
      );
    },
    onSuccess: async (quiz) => {
      if (!userId || !parsed.success) return;

      queryClient.setQueryData(
        quizAuthoringQueryKeys.quiz(
          userId,
          quiz.topicId ? parsed.data.courseId : parsed.data.courseId,
          parsed.data.topicId,
          quiz.id,
        ),
        quiz,
      );
      await invalidateTopicQuizData(
        queryClient,
        userId,
        parsed.data.courseId,
        parsed.data.topicId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useReorderTeacherQuizzes(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsed = teacherTopicQuizCollectionParamsSchema.safeParse({
    courseId,
    topicId,
  });

  const mutation = useMutation({
    mutationFn: (input: ReorderTeacherQuizzesRequest) => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return reorderTeacherQuizzes(params.courseId, params.topicId, input);
    },
    onSuccess: async (list) => {
      if (!userId || !parsed.success) return;

      queryClient.setQueryData(
        quizAuthoringQueryKeys.quizList(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
        ),
        list,
      );
      await queryClient.invalidateQueries({
        queryKey: quizAuthoringQueryKeys.quizDetails(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
        ),
      });
      await invalidateTopicQuizData(
        queryClient,
        userId,
        parsed.data.courseId,
        parsed.data.topicId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useTeacherQuizQuestions(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const parsed = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const params = parsed.success ? parsed.data : null;

  const query = useQuery({
    queryKey: quizAuthoringQueryKeys.questionList(
      userId,
      params?.courseId ?? null,
      params?.topicId ?? null,
      params?.quizId ?? null,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      return listTeacherQuizQuestions(requireParsed(parsed).quizId);
    },
    enabled: userId !== null && params !== null,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useTeacherQuizQuestion(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
  questionId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const parsedParent = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const parsedQuestion = teacherQuizQuestionParamsSchema.safeParse({
    quizId,
    questionId,
  });
  const valid = parsedParent.success && parsedQuestion.success;

  const query = useQuery({
    queryKey: quizAuthoringQueryKeys.question(
      userId,
      parsedParent.success ? parsedParent.data.courseId : null,
      parsedParent.success ? parsedParent.data.topicId : null,
      parsedParent.success ? parsedParent.data.quizId : null,
      parsedQuestion.success ? parsedQuestion.data.questionId : null,
    ),
    queryFn: () => {
      requireTeacherId(currentUser);
      const parent = requireParsed(parsedParent);
      const question = requireParsed(parsedQuestion);
      return getTeacherQuizQuestion(parent.quizId, question.questionId);
    },
    enabled: userId !== null && valid,
    retry: shouldRetryCourseQuery,
  });

  return {
    ...query,
    authorizationStatus,
    validationError: !parsedParent.success
      ? parsedParent.error
      : parsedQuestion.success
        ? null
        : parsedQuestion.error,
  };
}

export function useCreateTeacherQuizQuestion(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsed = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateTeacherQuizQuestionRequest) => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return createTeacherQuizQuestion(params.quizId, input);
    },
    onSuccess: async (question) => {
      if (!userId || !parsed.success) return;

      queryClient.setQueryData(
        quizAuthoringQueryKeys.question(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
          parsed.data.quizId,
          question.id,
        ),
        question,
      );
      await invalidateQuestionData(
        queryClient,
        userId,
        parsed.data.courseId,
        parsed.data.topicId,
        parsed.data.quizId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useUpdateTeacherQuizQuestion(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
  questionId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsedParent = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const parsedQuestion = teacherQuizQuestionParamsSchema.safeParse({
    quizId,
    questionId,
  });
  const valid = parsedParent.success && parsedQuestion.success;

  const mutation = useMutation({
    mutationFn: (input: UpdateTeacherQuizQuestionRequest) => {
      requireTeacherId(currentUser);
      const parent = requireParsed(parsedParent);
      const question = requireParsed(parsedQuestion);
      return updateTeacherQuizQuestion(
        parent.quizId,
        question.questionId,
        input,
      );
    },
    onSuccess: async (question) => {
      if (
        !userId ||
        !valid ||
        !parsedParent.success ||
        !parsedQuestion.success
      ) {
        return;
      }

      queryClient.setQueryData(
        quizAuthoringQueryKeys.question(
          userId,
          parsedParent.data.courseId,
          parsedParent.data.topicId,
          parsedParent.data.quizId,
          question.id,
        ),
        question,
      );
      await invalidateQuestionData(
        queryClient,
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: !parsedParent.success
      ? parsedParent.error
      : parsedQuestion.success
        ? null
        : parsedQuestion.error,
  };
}

export function useReorderTeacherQuizQuestions(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsed = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });

  const mutation = useMutation({
    mutationFn: (input: ReorderTeacherQuizQuestionsRequest) => {
      requireTeacherId(currentUser);
      const params = requireParsed(parsed);
      return reorderTeacherQuizQuestions(params.quizId, input);
    },
    onSuccess: async (list) => {
      if (!userId || !parsed.success) return;

      queryClient.setQueryData(
        quizAuthoringQueryKeys.questionList(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
          parsed.data.quizId,
        ),
        list,
      );
      await queryClient.invalidateQueries({
        queryKey: quizAuthoringQueryKeys.questionDetails(
          userId,
          parsed.data.courseId,
          parsed.data.topicId,
          parsed.data.quizId,
        ),
      });
      await invalidateQuestionData(
        queryClient,
        userId,
        parsed.data.courseId,
        parsed.data.topicId,
        parsed.data.quizId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: parsed.success ? null : parsed.error,
  };
}

export function useCreateTeacherQuizOption(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
  questionId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsedParent = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const parsedQuestion = teacherQuizQuestionParamsSchema.safeParse({
    quizId,
    questionId,
  });
  const valid = parsedParent.success && parsedQuestion.success;

  const mutation = useMutation({
    mutationFn: (input: CreateTeacherQuizOptionRequest) => {
      requireTeacherId(currentUser);
      requireParsed(parsedParent);
      const question = requireParsed(parsedQuestion);
      return createTeacherQuizOption(question.questionId, input);
    },
    onSuccess: async (option) => {
      if (
        !userId ||
        !valid ||
        !parsedParent.success ||
        !parsedQuestion.success
      ) {
        return;
      }

      const questionKey = quizAuthoringQueryKeys.question(
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
      queryClient.setQueryData<TeacherQuizQuestionResponse>(
        questionKey,
        (cached) =>
          cached
            ? {
                ...cached,
                options: [
                  ...cached.options.filter((item) => item.id !== option.id),
                  option,
                ].sort((left, right) => left.position - right.position),
              }
            : undefined,
      );
      await invalidateQuestionAndOptionData(
        queryClient,
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: !parsedParent.success
      ? parsedParent.error
      : parsedQuestion.success
        ? null
        : parsedQuestion.error,
  };
}

export function useUpdateTeacherQuizOption(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
  questionId: string | null | undefined,
  optionId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsedParent = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const parsedQuestion = teacherQuizQuestionParamsSchema.safeParse({
    quizId,
    questionId,
  });
  const parsedOption = z.uuid().safeParse(optionId);
  const valid =
    parsedParent.success && parsedQuestion.success && parsedOption.success;

  const mutation = useMutation({
    mutationFn: (input: UpdateTeacherQuizOptionRequest) => {
      requireTeacherId(currentUser);
      requireParsed(parsedParent);
      const question = requireParsed(parsedQuestion);
      const option = requireParsed(parsedOption);
      return updateTeacherQuizOption(question.questionId, option, input);
    },
    onSuccess: async (updatedOption) => {
      if (
        !userId ||
        !valid ||
        !parsedParent.success ||
        !parsedQuestion.success ||
        !parsedOption.success
      ) {
        return;
      }

      const questionKey = quizAuthoringQueryKeys.question(
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
      queryClient.setQueryData<TeacherQuizQuestionResponse>(
        questionKey,
        (cached) =>
          cached
            ? {
                ...cached,
                options: cached.options
                  .map((option) =>
                    option.id === updatedOption.id ? updatedOption : option,
                  )
                  .sort((left, right) => left.position - right.position),
              }
            : undefined,
      );
      await invalidateQuestionAndOptionData(
        queryClient,
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: !parsedParent.success
      ? parsedParent.error
      : !parsedQuestion.success
        ? parsedQuestion.error
        : parsedOption.success
          ? null
          : parsedOption.error,
  };
}

export function useReorderTeacherQuizOptions(
  courseId: string | null | undefined,
  topicId: string | null | undefined,
  quizId: string | null | undefined,
  questionId: string | null | undefined,
) {
  const { currentUser, authorizationStatus, userId } = useTeacherScope();
  const queryClient = useQueryClient();
  const parsedParent = teacherTopicQuizParamsSchema.safeParse({
    courseId,
    topicId,
    quizId,
  });
  const parsedQuestion = teacherQuizQuestionParamsSchema.safeParse({
    quizId,
    questionId,
  });
  const valid = parsedParent.success && parsedQuestion.success;

  const mutation = useMutation({
    mutationFn: (input: ReorderTeacherQuizOptionsRequest) => {
      requireTeacherId(currentUser);
      requireParsed(parsedParent);
      const question = requireParsed(parsedQuestion);
      return reorderTeacherQuizOptions(question.questionId, input);
    },
    onSuccess: async (options) => {
      if (
        !userId ||
        !valid ||
        !parsedParent.success ||
        !parsedQuestion.success
      ) {
        return;
      }

      const questionKey = quizAuthoringQueryKeys.question(
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
      queryClient.setQueryData<TeacherQuizQuestionResponse>(
        questionKey,
        (cached) => (cached ? { ...cached, options } : undefined),
      );
      await invalidateQuestionAndOptionData(
        queryClient,
        userId,
        parsedParent.data.courseId,
        parsedParent.data.topicId,
        parsedParent.data.quizId,
        parsedQuestion.data.questionId,
      );
    },
  });

  return {
    ...mutation,
    authorizationStatus,
    validationError: !parsedParent.success
      ? parsedParent.error
      : parsedQuestion.success
        ? null
        : parsedQuestion.error,
  };
}
