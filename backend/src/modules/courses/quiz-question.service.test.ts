import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherQuizQuestionListResponse,
  TeacherQuizQuestionResponse,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  CreateQuizQuestionResult,
  ReorderQuizQuestionsResult,
  UpdateQuizQuestionResult,
} from "./quiz-question.repository.js";
import {
  createQuizQuestionService,
  QuizQuestionPositionConflictError,
  QuizQuestionOrderValidationError,
  QuizQuestionServiceValidationError,
  TeacherQuizQuestionNotFoundError,
} from "./quiz-question.service.js";
import { TeacherQuizNotFoundError } from "./quiz.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const quizId = "550e8400-e29b-41d4-a716-446655440002";
const questionId = "550e8400-e29b-41d4-a716-446655440003";

const question: TeacherQuizQuestionResponse = {
  id: questionId,
  quizId,
  questionText: "What is 2 + 2?",
  position: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
  options: [],
};

function makeService() {
  const questionRepository = {
    quizExistsForTeacher: vi.fn(async () => true),
    createQuestion: vi.fn(async (): Promise<CreateQuizQuestionResult> => ({
      kind: "created",
      question,
    })),
    listQuizQuestions: vi.fn(
      async (): Promise<TeacherQuizQuestionListResponse> => ({
        items: [question],
      }),
    ),
    getQuestionById: vi.fn(
      async (): Promise<TeacherQuizQuestionResponse | null> => question,
    ),
    updateQuestion: vi.fn(async (): Promise<UpdateQuizQuestionResult> => ({
      kind: "updated",
      question,
    })),
    reorderQuizQuestions: vi.fn(
      async (): Promise<ReorderQuizQuestionsResult> => ({
        kind: "reordered",
        questions: [question],
      }),
    ),
  };
  const identityRepository = {
    findRolesByUserId: vi.fn(async (): Promise<UserRole[]> => [
      "student",
      "teacher",
    ]),
  };
  const teacherProfileRepository = {
    findByUserId: vi.fn(async (): Promise<{ id: string } | null> => ({
      id: teacherId,
    })),
  };

  const service = createQuizQuestionService({
    questionRepository,
    identityRepository,
    teacherProfileRepository,
  });

  return {
    service,
    questionRepository,
    identityRepository,
    teacherProfileRepository,
  };
}

describe("quiz question service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates validated questions for the authenticated Teacher profile", async () => {
    const { service, questionRepository } = makeService();

    await expect(
      service.createQuestion(userId, quizId, {
        questionText: "  What is 2 + 2?  ",
      }),
    ).resolves.toEqual(question);

    expect(questionRepository.createQuestion).toHaveBeenCalledWith(
      quizId,
      teacherId,
      { questionText: "What is 2 + 2?" },
    );
  });

  it("reorders all quiz questions through the repository", async () => {
    const { service, questionRepository } = makeService();
    await expect(
      service.reorderQuestions(userId, quizId, { questionIds: [questionId] }),
    ).resolves.toEqual({ items: [question] });
    expect(questionRepository.reorderQuizQuestions).toHaveBeenCalledWith(
      quizId,
      teacherId,
      [questionId],
    );
  });

  it("validates question reorder IDs and maps membership/conflict failures", async () => {
    const { service, questionRepository } = makeService();
    await expect(
      service.reorderQuestions(userId, quizId, { questionIds: ["bad"] }),
    ).rejects.toBeInstanceOf(QuizQuestionServiceValidationError);
    questionRepository.reorderQuizQuestions.mockResolvedValue({
      kind: "invalid_order",
    });
    await expect(
      service.reorderQuestions(userId, quizId, { questionIds: [] }),
    ).rejects.toBeInstanceOf(QuizQuestionOrderValidationError);
    questionRepository.reorderQuizQuestions.mockResolvedValue({
      kind: "conflict",
    });
    await expect(
      service.reorderQuestions(userId, quizId, { questionIds: [questionId] }),
    ).rejects.toBeInstanceOf(QuizQuestionPositionConflictError);
  });

  it("accepts incomplete Draft questions without options", async () => {
    const { service, questionRepository } = makeService();
    await service.createQuestion(userId, quizId, {
      questionText: "Draft question",
    });
    expect(questionRepository.createQuestion).toHaveBeenCalled();
    await expect(service.listQuestions(userId, quizId)).resolves.toMatchObject({
      items: [{ options: [] }],
    });
  });

  it("rejects invalid IDs or data before repository writes", async () => {
    const { service, questionRepository } = makeService();

    await expect(
      service.createQuestion(userId, "invalid-id", {
        questionText: "Question",
      }),
    ).rejects.toBeInstanceOf(QuizQuestionServiceValidationError);
    await expect(
      service.createQuestion(userId, quizId, { questionText: "  " }),
    ).rejects.toBeInstanceOf(QuizQuestionServiceValidationError);
    await expect(
      service.updateQuestion(userId, quizId, questionId, {}),
    ).rejects.toBeInstanceOf(QuizQuestionServiceValidationError);

    expect(questionRepository.createQuestion).not.toHaveBeenCalled();
    expect(questionRepository.updateQuestion).not.toHaveBeenCalled();
  });

  it("requires both an assigned Teacher role and a Teacher profile", async () => {
    const noRole = makeService();
    noRole.identityRepository.findRolesByUserId.mockResolvedValue(["student"]);
    await expect(
      noRole.service.listQuestions(userId, quizId),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    const noProfile = makeService();
    noProfile.teacherProfileRepository.findByUserId.mockResolvedValue(null);
    await expect(
      noProfile.service.listQuestions(userId, quizId),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);
  });

  it("checks quiz ownership before listing, and preserves repository order", async () => {
    const { service, questionRepository } = makeService();
    await expect(service.listQuestions(userId, quizId)).resolves.toEqual({
      items: [question],
    });
    expect(questionRepository.quizExistsForTeacher).toHaveBeenCalledWith(
      quizId,
      teacherId,
    );

    questionRepository.quizExistsForTeacher.mockResolvedValue(false);
    await expect(service.listQuestions(userId, quizId)).rejects.toBeInstanceOf(
      TeacherQuizNotFoundError,
    );
    expect(questionRepository.listQuizQuestions).toHaveBeenCalledTimes(1);
  });

  it("allows an owned quiz with no questions and uses the repository order", async () => {
    const { service, questionRepository } = makeService();
    questionRepository.listQuizQuestions.mockResolvedValue({ items: [] });
    await expect(service.listQuestions(userId, quizId)).resolves.toEqual({
      items: [],
    });
  });

  it("maps retrieval, Draft, and position-conflict results to typed errors", async () => {
    const { service, questionRepository } = makeService();

    questionRepository.getQuestionById.mockResolvedValue(null);
    await expect(
      service.getQuestion(userId, quizId, questionId),
    ).rejects.toBeInstanceOf(TeacherQuizQuestionNotFoundError);

    questionRepository.createQuestion.mockResolvedValue({
      kind: "not_editable",
    });
    await expect(
      service.createQuestion(userId, quizId, { questionText: "Draft" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    questionRepository.createQuestion.mockResolvedValue({ kind: "conflict" });
    await expect(
      service.createQuestion(userId, quizId, { questionText: "Draft" }),
    ).rejects.toBeInstanceOf(QuizQuestionPositionConflictError);

    questionRepository.updateQuestion.mockResolvedValue({ kind: "not_found" });
    await expect(
      service.updateQuestion(userId, quizId, questionId, {
        questionText: "Updated",
      }),
    ).rejects.toBeInstanceOf(TeacherQuizQuestionNotFoundError);
  });
});
