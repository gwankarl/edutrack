import { ZodError, z } from "zod";

import {
  createTeacherQuizRequestSchema,
  reorderTeacherQuizzesRequestSchema,
  teacherQuizListResponseSchema,
  teacherQuizResponseSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
  updateTeacherQuizRequestSchema,
  type TeacherQuizListResponse,
  type TeacherQuizResponse,
  type UpdateTeacherQuizRequest,
} from "@edutrack/contracts";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
  type CourseIdentityRepository,
  type CourseRepository,
  type CourseTeacherProfileRepository,
} from "./course.service.js";
import { TeacherTopicNotFoundError } from "./topic.service.js";
import type { TopicRepository } from "./topic.service.js";
import type {
  CreateQuizResult,
  ReorderQuizzesResult,
  UpdateQuizResult,
} from "./quiz.repository.js";

export interface QuizRepository {
  createQuiz(
    courseId: string,
    topicId: string,
    teacherId: string,
    data: {
      title: string;
      description?: string;
    },
  ): Promise<CreateQuizResult>;
  listTopicQuizzes(
    courseId: string,
    topicId: string,
    teacherId: string,
  ): Promise<TeacherQuizResponse[]>;
  getQuizById(
    courseId: string,
    topicId: string,
    quizId: string,
    teacherId: string,
  ): Promise<TeacherQuizResponse | null>;
  updateQuiz(
    courseId: string,
    topicId: string,
    quizId: string,
    teacherId: string,
    data: UpdateTeacherQuizRequest,
  ): Promise<UpdateQuizResult>;
  reorderTopicQuizzes(
    courseId: string,
    topicId: string,
    teacherId: string,
    quizIds: string[],
  ): Promise<ReorderQuizzesResult>;
}

export interface QuizServiceDependencies {
  quizRepository: QuizRepository;
  courseRepository: Pick<CourseRepository, "getTeacherCourseById">;
  topicRepository: Pick<TopicRepository, "getTopicById">;
  teacherProfileRepository: CourseTeacherProfileRepository;
  identityRepository: CourseIdentityRepository;
}

export class QuizServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Quiz input is invalid.");
    this.name = "QuizServiceValidationError";
  }
}

export class TeacherQuizNotFoundError extends Error {
  constructor() {
    // Also represents a quiz outside the requested course or topic.
    super("Quiz was not found.");
    this.name = "TeacherQuizNotFoundError";
  }
}

export class QuizPositionConflictError extends Error {
  constructor() {
    super("A quiz position conflict occurred.");
    this.name = "QuizPositionConflictError";
  }
}

export class QuizOrderValidationError extends Error {
  constructor() {
    super("Quiz order must contain every quiz in the topic exactly once.");
    this.name = "QuizOrderValidationError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new QuizServiceValidationError(error.issues);
    }

    throw error;
  }
}

export function createQuizService({
  quizRepository,
  courseRepository,
  topicRepository,
  teacherProfileRepository,
  identityRepository,
}: QuizServiceDependencies) {
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

  async function requireOwnedCourse(courseId: string, teacherId: string) {
    const course = await courseRepository.getTeacherCourseById(
      courseId,
      teacherId,
    );

    if (!course) {
      throw new TeacherCourseNotFoundError();
    }

    return course;
  }

  async function requireOwnedTopic(
    courseId: string,
    topicId: string,
    teacherId: string,
  ): Promise<void> {
    const topic = await topicRepository.getTopicById(
      courseId,
      topicId,
      teacherId,
    );

    if (!topic) {
      throw new TeacherTopicNotFoundError();
    }
  }

  function requireDraftCourse(status: string): void {
    if (status !== "draft") {
      throw new TeacherCourseNotEditableError();
    }
  }

  function handleCreateResult(result: CreateQuizResult): TeacherQuizResponse {
    if (result.kind === "not_found") {
      // The repository hides non-owned or missing course/topic parents.
      throw new TeacherTopicNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    if (result.kind === "conflict") {
      throw new QuizPositionConflictError();
    }

    return teacherQuizResponseSchema.parse(result.quiz);
  }

  function handleUpdateResult(result: UpdateQuizResult): TeacherQuizResponse {
    if (result.kind === "not_found") {
      throw new TeacherQuizNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    return teacherQuizResponseSchema.parse(result.quiz);
  }

  function handleReorderResult(
    result: ReorderQuizzesResult,
  ): TeacherQuizListResponse {
    if (result.kind === "not_found") throw new TeacherTopicNotFoundError();
    if (result.kind === "not_editable")
      throw new TeacherCourseNotEditableError();
    if (result.kind === "invalid_order") throw new QuizOrderValidationError();
    if (result.kind === "conflict") throw new QuizPositionConflictError();
    return teacherQuizListResponseSchema.parse({ items: result.quizzes });
  }

  return {
    async createQuiz(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      input: unknown,
    ): Promise<TeacherQuizResponse> {
      const params = parseInput(teacherTopicQuizCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const request = parseInput(createTeacherQuizRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);

      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const result = await quizRepository.createQuiz(
        params.courseId,
        params.topicId,
        teacherId,
        request,
      );

      return handleCreateResult(result);
    },

    async listTopicQuizzes(
      userId: string,
      courseId: unknown,
      topicId: unknown,
    ): Promise<TeacherQuizListResponse> {
      const params = parseInput(teacherTopicQuizCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const teacherId = await resolveTeacherProfile(userId);

      await requireOwnedCourse(params.courseId, teacherId);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const items = await quizRepository.listTopicQuizzes(
        params.courseId,
        params.topicId,
        teacherId,
      );

      return teacherQuizListResponseSchema.parse({ items });
    },

    async getQuiz(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      quizId: unknown,
    ): Promise<TeacherQuizResponse> {
      const params = parseInput(teacherTopicQuizParamsSchema, {
        courseId,
        topicId,
        quizId,
      });
      const teacherId = await resolveTeacherProfile(userId);

      await requireOwnedCourse(params.courseId, teacherId);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const quiz = await quizRepository.getQuizById(
        params.courseId,
        params.topicId,
        params.quizId,
        teacherId,
      );

      if (!quiz) {
        throw new TeacherQuizNotFoundError();
      }

      return teacherQuizResponseSchema.parse(quiz);
    },

    async updateQuiz(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      quizId: unknown,
      input: unknown,
    ): Promise<TeacherQuizResponse> {
      const params = parseInput(teacherTopicQuizParamsSchema, {
        courseId,
        topicId,
        quizId,
      });
      const request = parseInput(updateTeacherQuizRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);

      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const result = await quizRepository.updateQuiz(
        params.courseId,
        params.topicId,
        params.quizId,
        teacherId,
        request,
      );

      return handleUpdateResult(result);
    },

    async reorderQuizzes(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      input: unknown,
    ): Promise<TeacherQuizListResponse> {
      const params = parseInput(teacherTopicQuizCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const request = parseInput(reorderTeacherQuizzesRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);
      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      return handleReorderResult(
        await quizRepository.reorderTopicQuizzes(
          params.courseId,
          params.topicId,
          teacherId,
          request.quizIds,
        ),
      );
    },
  };
}
