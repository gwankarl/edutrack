import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeacherQuizOptionResponse } from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  ReorderQuizOptionsResult,
  CreateQuizOptionResult,
  SetCorrectQuizOptionResult,
  UpdateQuizOptionResult,
} from "./quiz-option.repository.js";
import {
  createQuizOptionService,
  QuizOptionConflictError,
  QuizOptionOrderValidationError,
  QuizOptionServiceValidationError,
  TeacherQuizOptionNotFoundError,
} from "./quiz-option.service.js";
import { TeacherQuizQuestionNotFoundError } from "./quiz-question.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const questionId = "550e8400-e29b-41d4-a716-446655440002";
const optionId = "550e8400-e29b-41d4-a716-446655440003";

const option: TeacherQuizOptionResponse = {
  id: optionId,
  questionId,
  optionText: "4",
  position: 1,
  isCorrect: true,
};

function makeService() {
  const optionRepository = {
    createOption: vi.fn(async (): Promise<CreateQuizOptionResult> => ({
      kind: "created",
      option,
    })),
    listQuestionOptions: vi.fn(
      async (): Promise<TeacherQuizOptionResponse[]> => [option],
    ),
    getOptionById: vi.fn(
      async (): Promise<TeacherQuizOptionResponse | null> => option,
    ),
    updateOption: vi.fn(async (): Promise<UpdateQuizOptionResult> => ({
      kind: "updated",
      option,
    })),
    setCorrectOption: vi.fn(async (): Promise<SetCorrectQuizOptionResult> => ({
      kind: "updated",
      option,
    })),
    reorderQuestionOptions: vi.fn(
      async (): Promise<ReorderQuizOptionsResult> => ({
        kind: "reordered",
        options: [option],
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

  const service = createQuizOptionService({
    optionRepository,
    identityRepository,
    teacherProfileRepository,
  });

  return {
    service,
    optionRepository,
    identityRepository,
    teacherProfileRepository,
  };
}

describe("quiz option service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an option for the Teacher profile and permits incomplete answers", async () => {
    const { service, optionRepository } = makeService();

    await expect(
      service.createOption(userId, questionId, { optionText: "  4  " }),
    ).resolves.toEqual(option);
    expect(optionRepository.createOption).toHaveBeenCalledWith(
      questionId,
      teacherId,
      { optionText: "4" },
    );
  });

  it("reorders options while preserving the repository response", async () => {
    const { service, optionRepository } = makeService();
    await expect(
      service.reorderOptions(userId, questionId, { optionIds: [optionId] }),
    ).resolves.toEqual([option]);
    expect(optionRepository.reorderQuestionOptions).toHaveBeenCalledWith(
      questionId,
      teacherId,
      [optionId],
    );
  });

  it("validates option IDs and maps exact-membership conflicts", async () => {
    const { service, optionRepository } = makeService();
    await expect(
      service.reorderOptions(userId, questionId, { optionIds: ["bad"] }),
    ).rejects.toBeInstanceOf(QuizOptionServiceValidationError);
    optionRepository.reorderQuestionOptions.mockResolvedValue({
      kind: "invalid_order",
    });
    await expect(
      service.reorderOptions(userId, questionId, { optionIds: [] }),
    ).rejects.toBeInstanceOf(QuizOptionOrderValidationError);
    optionRepository.reorderQuestionOptions.mockResolvedValue({
      kind: "conflict",
    });
    await expect(
      service.reorderOptions(userId, questionId, { optionIds: [optionId] }),
    ).rejects.toMatchObject({
      constructor: QuizOptionConflictError,
      reason: "position",
    });
  });

  it("atomically selects a correct option and supports clearing it", async () => {
    const { service, optionRepository } = makeService();

    await service.updateOption(userId, questionId, optionId, {
      isCorrect: true,
    });
    expect(optionRepository.setCorrectOption).toHaveBeenCalledWith(
      questionId,
      optionId,
      teacherId,
      { isCorrect: true },
    );
    expect(optionRepository.updateOption).not.toHaveBeenCalled();

    await service.updateOption(userId, questionId, optionId, {
      isCorrect: false,
    });
    expect(optionRepository.updateOption).toHaveBeenCalledWith(
      questionId,
      optionId,
      teacherId,
      { isCorrect: false },
    );
  });

  it("validates IDs and request data before repository calls", async () => {
    const { service, optionRepository } = makeService();

    await expect(
      service.createOption(userId, "invalid-id", { optionText: "Option" }),
    ).rejects.toBeInstanceOf(QuizOptionServiceValidationError);
    await expect(
      service.createOption(userId, questionId, { optionText: " " }),
    ).rejects.toBeInstanceOf(QuizOptionServiceValidationError);
    await expect(
      service.updateOption(userId, questionId, optionId, {}),
    ).rejects.toBeInstanceOf(QuizOptionServiceValidationError);

    expect(optionRepository.createOption).not.toHaveBeenCalled();
    expect(optionRepository.updateOption).not.toHaveBeenCalled();
    expect(optionRepository.setCorrectOption).not.toHaveBeenCalled();
  });

  it("requires the current Teacher role and profile", async () => {
    const noRole = makeService();
    noRole.identityRepository.findRolesByUserId.mockResolvedValue(["student"]);
    await expect(
      noRole.service.createOption(userId, questionId, { optionText: "Option" }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    const noProfile = makeService();
    noProfile.teacherProfileRepository.findByUserId.mockResolvedValue(null);
    await expect(
      noProfile.service.createOption(userId, questionId, {
        optionText: "Option",
      }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);
  });

  it("maps missing parents, missing options, Draft restrictions, and conflicts", async () => {
    const { service, optionRepository } = makeService();

    optionRepository.createOption.mockResolvedValue({ kind: "not_found" });
    await expect(
      service.createOption(userId, questionId, { optionText: "Option" }),
    ).rejects.toBeInstanceOf(TeacherQuizQuestionNotFoundError);

    optionRepository.createOption.mockResolvedValue({ kind: "not_editable" });
    await expect(
      service.createOption(userId, questionId, { optionText: "Option" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);

    optionRepository.createOption.mockResolvedValue({
      kind: "conflict",
      reason: "position",
    });
    await expect(
      service.createOption(userId, questionId, { optionText: "Option" }),
    ).rejects.toMatchObject({
      constructor: QuizOptionConflictError,
      reason: "position",
    });

    optionRepository.setCorrectOption.mockResolvedValue({
      kind: "conflict",
      reason: "correct_answer",
    });
    const conflict = service.updateOption(userId, questionId, optionId, {
      isCorrect: true,
    });
    await expect(conflict).rejects.toBeInstanceOf(QuizOptionConflictError);
    await expect(conflict).rejects.toHaveProperty("reason", "correct_answer");

    optionRepository.getOptionById.mockResolvedValue(null);
    await expect(
      service.getOption(userId, questionId, optionId),
    ).rejects.toBeInstanceOf(TeacherQuizOptionNotFoundError);
    optionRepository.updateOption.mockResolvedValue({ kind: "not_found" });
    await expect(
      service.updateOption(userId, questionId, optionId, {
        optionText: "Changed",
      }),
    ).rejects.toBeInstanceOf(TeacherQuizOptionNotFoundError);
  });
});
