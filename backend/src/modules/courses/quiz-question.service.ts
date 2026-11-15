import { ZodError, z } from "zod";

import {
  createTeacherQuizQuestionRequestSchema,
  reorderTeacherQuizQuestionsRequestSchema,
  teacherQuizQuestionCollectionParamsSchema,
  teacherQuizQuestionListResponseSchema,
  teacherQuizQuestionParamsSchema,
  teacherQuizQuestionResponseSchema,
  updateTeacherQuizQuestionRequestSchema,
  type CreateTeacherQuizQuestionRequest,
  type TeacherQuizQuestionListResponse,
  type TeacherQuizQuestionResponse,
  type UpdateTeacherQuizQuestionRequest,
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
import { TeacherQuizNotFoundError } from "./quiz.service.js";

export interface QuizQuestionRepository {
  quizExistsForTeacher(quizId: string, teacherId: string): Promise<boolean>;
  createQuestion(
    quizId: string,
    teacherId: string,
    data: CreateTeacherQuizQuestionRequest,
  ): Promise<CreateQuizQuestionResult>;
  listQuizQuestions(
    quizId: string,
    teacherId: string,
  ): Promise<TeacherQuizQuestionListResponse>;
  getQuestionById(
    quizId: string,
    questionId: string,
    teacherId: string,
  ): Promise<TeacherQuizQuestionResponse | null>;
  updateQuestion(
    quizId: string,
    questionId: string,
    teacherId: string,
    data: UpdateTeacherQuizQuestionRequest,
  ): Promise<UpdateQuizQuestionResult>;
  reorderQuizQuestions(
    quizId: string,
    teacherId: string,
    questionIds: string[],
  ): Promise<ReorderQuizQuestionsResult>;
}

export interface QuizQuestionIdentityRepository {
  findRolesByUserId(userId: string): Promise<UserRole[]>;
}

export interface QuizQuestionTeacherProfileRepository {
  findByUserId(userId: string): Promise<{ id: string } | null>;
}

export interface QuizQuestionServiceDependencies {
  questionRepository: QuizQuestionRepository;
  identityRepository: QuizQuestionIdentityRepository;
  teacherProfileRepository: QuizQuestionTeacherProfileRepository;
}

export class QuizQuestionServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Quiz question input is invalid.");
    this.name = "QuizQuestionServiceValidationError";
  }
}

export class TeacherQuizQuestionNotFoundError extends Error {
  constructor() {
    super("Quiz question was not found.");
    this.name = "TeacherQuizQuestionNotFoundError";
  }
}

export class QuizQuestionPositionConflictError extends Error {
  constructor() {
    super("A quiz question position conflict occurred.");
    this.name = "QuizQuestionPositionConflictError";
  }
}

export class QuizQuestionOrderValidationError extends Error {
  constructor() {
    super("Question order must contain every quiz question exactly once.");
    this.name = "QuizQuestionOrderValidationError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new QuizQuestionServiceValidationError(error.issues);
    }
    throw error;
  }
}

export function createQuizQuestionService({
  questionRepository,
  identityRepository,
  teacherProfileRepository,
}: QuizQuestionServiceDependencies) {
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
    result: CreateQuizQuestionResult,
  ): TeacherQuizQuestionResponse {
    if (result.kind === "not_found") {
      throw new TeacherQuizNotFoundError();
    }
    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }
    if (result.kind === "conflict") {
      throw new QuizQuestionPositionConflictError();
    }

    return teacherQuizQuestionResponseSchema.parse(result.question);
  }

  function mapUpdateResult(
    result: UpdateQuizQuestionResult,
  ): TeacherQuizQuestionResponse {
    if (result.kind === "not_found") {
      throw new TeacherQuizQuestionNotFoundError();
    }
    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    return teacherQuizQuestionResponseSchema.parse(result.question);
  }

  return {
    async createQuestion(
      userId: string,
      quizId: unknown,
      input: unknown,
    ): Promise<TeacherQuizQuestionResponse> {
      const params = parseInput(teacherQuizQuestionCollectionParamsSchema, {
        quizId,
      });
      const request = parseInput(createTeacherQuizQuestionRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      return mapCreateResult(
        await questionRepository.createQuestion(
          params.quizId,
          teacherId,
          request,
        ),
      );
    },

    async listQuestions(
      userId: string,
      quizId: unknown,
    ): Promise<TeacherQuizQuestionListResponse> {
      const params = parseInput(teacherQuizQuestionCollectionParamsSchema, {
        quizId,
      });
      const teacherId = await resolveTeacherProfile(userId);
      const quizExists = await questionRepository.quizExistsForTeacher(
        params.quizId,
        teacherId,
      );
      if (!quizExists) throw new TeacherQuizNotFoundError();

      const result = await questionRepository.listQuizQuestions(
        params.quizId,
        teacherId,
      );

      return teacherQuizQuestionListResponseSchema.parse(result);
    },

    async getQuestion(
      userId: string,
      quizId: unknown,
      questionId: unknown,
    ): Promise<TeacherQuizQuestionResponse> {
      const params = parseInput(teacherQuizQuestionParamsSchema, {
        quizId,
        questionId,
      });
      const teacherId = await resolveTeacherProfile(userId);
      const question = await questionRepository.getQuestionById(
        params.quizId,
        params.questionId,
        teacherId,
      );

      if (!question) throw new TeacherQuizQuestionNotFoundError();
      return teacherQuizQuestionResponseSchema.parse(question);
    },

    async updateQuestion(
      userId: string,
      quizId: unknown,
      questionId: unknown,
      input: unknown,
    ): Promise<TeacherQuizQuestionResponse> {
      const params = parseInput(teacherQuizQuestionParamsSchema, {
        quizId,
        questionId,
      });
      const request = parseInput(updateTeacherQuizQuestionRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      return mapUpdateResult(
        await questionRepository.updateQuestion(
          params.quizId,
          params.questionId,
          teacherId,
          request,
        ),
      );
    },

    async reorderQuestions(
      userId: string,
      quizId: unknown,
      input: unknown,
    ): Promise<TeacherQuizQuestionListResponse> {
      const params = parseInput(teacherQuizQuestionCollectionParamsSchema, {
        quizId,
      });
      const request = parseInput(
        reorderTeacherQuizQuestionsRequestSchema,
        input,
      );
      const teacherId = await resolveTeacherProfile(userId);
      const result = await questionRepository.reorderQuizQuestions(
        params.quizId,
        teacherId,
        request.questionIds,
      );

      if (result.kind === "not_found") throw new TeacherQuizNotFoundError();
      if (result.kind === "not_editable") {
        throw new TeacherCourseNotEditableError();
      }
      if (result.kind === "invalid_order") {
        throw new QuizQuestionOrderValidationError();
      }
      if (result.kind === "conflict") {
        throw new QuizQuestionPositionConflictError();
      }

      return teacherQuizQuestionListResponseSchema.parse({
        items: result.questions,
      });
    },
  };
}
