import { ZodError, z } from "zod";

import {
  createTeacherQuizOptionRequestSchema,
  reorderTeacherQuizOptionsRequestSchema,
  teacherQuizOptionListResponseSchema,
  teacherQuizOptionParamsSchema,
  teacherQuizOptionResponseSchema,
  updateTeacherQuizOptionRequestSchema,
  type CreateTeacherQuizOptionRequest,
  type TeacherQuizOptionListResponse,
  type TeacherQuizOptionResponse,
  type UpdateTeacherQuizOptionRequest,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  TeacherCourseNotEditableError,
  TeacherNotEligibleError,
} from "./course.service.js";
import type {
  CreateQuizOptionResult,
  ReorderQuizOptionsResult,
  SetCorrectQuizOptionResult,
  UpdateQuizOptionResult,
} from "./quiz-option.repository.js";
import { TeacherQuizQuestionNotFoundError } from "./quiz-question.service.js";

export interface QuizOptionRepository {
  createOption(
    questionId: string,
    teacherId: string,
    data: CreateTeacherQuizOptionRequest,
  ): Promise<CreateQuizOptionResult>;
  getOptionById(
    questionId: string,
    optionId: string,
    teacherId: string,
  ): Promise<TeacherQuizOptionResponse | null>;
  updateOption(
    questionId: string,
    optionId: string,
    teacherId: string,
    data: UpdateTeacherQuizOptionRequest,
  ): Promise<UpdateQuizOptionResult>;
  setCorrectOption(
    questionId: string,
    optionId: string,
    teacherId: string,
    data: UpdateTeacherQuizOptionRequest,
  ): Promise<SetCorrectQuizOptionResult>;
  reorderQuestionOptions(
    questionId: string,
    teacherId: string,
    optionIds: string[],
  ): Promise<ReorderQuizOptionsResult>;
}

export interface QuizOptionIdentityRepository {
  findRolesByUserId(userId: string): Promise<UserRole[]>;
}

export interface QuizOptionTeacherProfileRepository {
  findByUserId(userId: string): Promise<{ id: string } | null>;
}

export interface QuizOptionServiceDependencies {
  optionRepository: QuizOptionRepository;
  identityRepository: QuizOptionIdentityRepository;
  teacherProfileRepository: QuizOptionTeacherProfileRepository;
}

export class QuizOptionServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Quiz option input is invalid.");
    this.name = "QuizOptionServiceValidationError";
  }
}

export class TeacherQuizOptionNotFoundError extends Error {
  constructor() {
    super("Quiz option was not found.");
    this.name = "TeacherQuizOptionNotFoundError";
  }
}

export class QuizOptionConflictError extends Error {
  constructor(readonly reason: "position" | "correct_answer") {
    super("The quiz option conflicts with an existing option.");
    this.name = "QuizOptionConflictError";
  }
}

export class QuizOptionOrderValidationError extends Error {
  constructor() {
    super("Option order must contain every answer option exactly once.");
    this.name = "QuizOptionOrderValidationError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new QuizOptionServiceValidationError(error.issues);
    }
    throw error;
  }
}

export function createQuizOptionService({
  optionRepository,
  identityRepository,
  teacherProfileRepository,
}: QuizOptionServiceDependencies) {
  async function resolveTeacherProfile(userId: string): Promise<string> {
    const [roles, profile] = await Promise.all([
      identityRepository.findRolesByUserId(userId),
      teacherProfileRepository.findByUserId(userId),
    ]);

    if (!roles.includes("teacher") || !profile) {
      throw new TeacherNotEligibleError();
    }

    return profile.id;
  }

  function mapCreateResult(
    result: CreateQuizOptionResult,
  ): TeacherQuizOptionResponse {
    if (result.kind === "not_found") {
      throw new TeacherQuizQuestionNotFoundError();
    }
    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }
    if (result.kind === "conflict") {
      throw new QuizOptionConflictError(result.reason);
    }

    return teacherQuizOptionResponseSchema.parse(result.option);
  }

  function mapUpdateResult(
    result: UpdateQuizOptionResult | SetCorrectQuizOptionResult,
  ): TeacherQuizOptionResponse {
    if (result.kind === "not_found") {
      throw new TeacherQuizOptionNotFoundError();
    }
    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }
    if (result.kind === "conflict") {
      throw new QuizOptionConflictError(result.reason);
    }

    return teacherQuizOptionResponseSchema.parse(result.option);
  }

  return {
    async createOption(
      userId: string,
      questionId: unknown,
      input: unknown,
    ): Promise<TeacherQuizOptionResponse> {
      const parsedQuestionId = parseInput(z.uuid(), questionId);
      const request = parseInput(createTeacherQuizOptionRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      return mapCreateResult(
        await optionRepository.createOption(
          parsedQuestionId,
          teacherId,
          request,
        ),
      );
    },

    async getOption(
      userId: string,
      questionId: unknown,
      optionId: unknown,
    ): Promise<TeacherQuizOptionResponse> {
      const params = parseInput(teacherQuizOptionParamsSchema, {
        questionId,
        optionId,
      });
      const teacherId = await resolveTeacherProfile(userId);
      const option = await optionRepository.getOptionById(
        params.questionId,
        params.optionId,
        teacherId,
      );

      if (!option) throw new TeacherQuizOptionNotFoundError();
      return teacherQuizOptionResponseSchema.parse(option);
    },

    async updateOption(
      userId: string,
      questionId: unknown,
      optionId: unknown,
      input: unknown,
    ): Promise<TeacherQuizOptionResponse> {
      const params = parseInput(teacherQuizOptionParamsSchema, {
        questionId,
        optionId,
      });
      const request = parseInput(updateTeacherQuizOptionRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      const result =
        request.isCorrect === true
          ? await optionRepository.setCorrectOption(
              params.questionId,
              params.optionId,
              teacherId,
              request,
            )
          : await optionRepository.updateOption(
              params.questionId,
              params.optionId,
              teacherId,
              request,
            );

      return mapUpdateResult(result);
    },

    async reorderOptions(
      userId: string,
      questionId: unknown,
      input: unknown,
    ): Promise<TeacherQuizOptionListResponse> {
      const parsedQuestionId = parseInput(z.uuid(), questionId);
      const request = parseInput(reorderTeacherQuizOptionsRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const result = await optionRepository.reorderQuestionOptions(
        parsedQuestionId,
        teacherId,
        request.optionIds,
      );

      if (result.kind === "not_found") {
        throw new TeacherQuizQuestionNotFoundError();
      }
      if (result.kind === "not_editable") {
        throw new TeacherCourseNotEditableError();
      }
      if (result.kind === "invalid_order") {
        throw new QuizOptionOrderValidationError();
      }
      if (result.kind === "conflict") {
        throw new QuizOptionConflictError("position");
      }

      return teacherQuizOptionListResponseSchema.parse(result.options);
    },
  };
}
