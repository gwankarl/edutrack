import { ZodError, z } from "zod";

import {
  createTeacherLessonRequestSchema,
  reorderTeacherLessonsRequestSchema,
  teacherCourseTopicLessonParamsSchema,
  teacherLessonListResponseSchema,
  teacherLessonResponseSchema,
  teacherTopicLessonCollectionParamsSchema,
  updateTeacherLessonRequestSchema,
  type CreateTeacherLessonRequest,
  type TeacherLessonListResponse,
  type TeacherLessonResponse,
  type ReorderTeacherLessonsRequest,
  type UpdateTeacherLessonRequest,
} from "@edutrack/contracts";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
  type CourseIdentityRepository,
  type CourseRepository,
  type CourseTeacherProfileRepository,
} from "./course.service.js";
import {
  TeacherTopicNotFoundError,
  type TopicRepository,
} from "./topic.service.js";
import type {
  CreateLessonResult,
  ReorderLessonsResult,
  UpdateLessonResult,
} from "./lesson.repository.js";

export interface LessonRepository {
  createLesson(
    courseId: string,
    topicId: string,
    teacherId: string,
    data: CreateTeacherLessonRequest,
  ): Promise<CreateLessonResult>;
  listTopicLessons(
    courseId: string,
    topicId: string,
    teacherId: string,
  ): Promise<TeacherLessonResponse[]>;
  getLessonById(
    courseId: string,
    topicId: string,
    lessonId: string,
    teacherId: string,
  ): Promise<TeacherLessonResponse | null>;
  updateLesson(
    courseId: string,
    topicId: string,
    lessonId: string,
    teacherId: string,
    data: UpdateTeacherLessonRequest,
  ): Promise<UpdateLessonResult>;
  reorderTopicLessons(
    courseId: string,
    topicId: string,
    teacherId: string,
    lessonIds: string[],
  ): Promise<ReorderLessonsResult>;
}

export interface LessonServiceDependencies {
  lessonRepository: LessonRepository;
  courseRepository: Pick<CourseRepository, "getTeacherCourseById">;
  topicRepository: Pick<TopicRepository, "getTopicById">;
  teacherProfileRepository: CourseTeacherProfileRepository;
  identityRepository: CourseIdentityRepository;
}

export class LessonServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Lesson input is invalid.");
    this.name = "LessonServiceValidationError";
  }
}

export class TeacherLessonNotFoundError extends Error {
  constructor() {
    super("Lesson was not found.");
    this.name = "TeacherLessonNotFoundError";
  }
}

export class LessonPositionConflictError extends Error {
  constructor() {
    super("A lesson position conflict occurred.");
    this.name = "LessonPositionConflictError";
  }
}

export class LessonOrderMismatchError extends Error {
  constructor() {
    super(
      "The lesson order must contain every lesson in this topic exactly once.",
    );
    this.name = "LessonOrderMismatchError";
  }
}

export class LessonReorderConflictError extends Error {
  constructor() {
    super("The lesson order could not be updated. Please retry the request.");
    this.name = "LessonReorderConflictError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new LessonServiceValidationError(error.issues);
    }

    throw error;
  }
}

export function createLessonService({
  lessonRepository,
  courseRepository,
  topicRepository,
  teacherProfileRepository,
  identityRepository,
}: LessonServiceDependencies) {
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

  function handleCreateResult(
    result: CreateLessonResult,
  ): TeacherLessonResponse {
    if (result.kind === "not_found") {
      throw new TeacherTopicNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    if (result.kind === "conflict") {
      throw new LessonPositionConflictError();
    }

    return teacherLessonResponseSchema.parse(result.lesson);
  }

  function handleUpdateResult(
    result: UpdateLessonResult,
  ): TeacherLessonResponse {
    if (result.kind === "not_found") {
      throw new TeacherLessonNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    return teacherLessonResponseSchema.parse(result.lesson);
  }

  return {
    async createLesson(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      input: unknown,
    ): Promise<TeacherLessonResponse> {
      const params = parseInput(teacherTopicLessonCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const request = parseInput(createTeacherLessonRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);

      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const result = await lessonRepository.createLesson(
        params.courseId,
        params.topicId,
        teacherId,
        request,
      );

      return handleCreateResult(result);
    },

    async listTopicLessons(
      userId: string,
      courseId: unknown,
      topicId: unknown,
    ): Promise<TeacherLessonListResponse> {
      const params = parseInput(teacherTopicLessonCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const teacherId = await resolveTeacherProfile(userId);

      await requireOwnedCourse(params.courseId, teacherId);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const items = await lessonRepository.listTopicLessons(
        params.courseId,
        params.topicId,
        teacherId,
      );

      return teacherLessonListResponseSchema.parse({ items });
    },

    async getLesson(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      lessonId: unknown,
    ): Promise<TeacherLessonResponse> {
      const params = parseInput(teacherCourseTopicLessonParamsSchema, {
        courseId,
        topicId,
        lessonId,
      });
      const teacherId = await resolveTeacherProfile(userId);

      await requireOwnedCourse(params.courseId, teacherId);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const lesson = await lessonRepository.getLessonById(
        params.courseId,
        params.topicId,
        params.lessonId,
        teacherId,
      );

      if (!lesson) {
        throw new TeacherLessonNotFoundError();
      }

      return teacherLessonResponseSchema.parse(lesson);
    },

    async updateLesson(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      lessonId: unknown,
      input: unknown,
    ): Promise<TeacherLessonResponse> {
      const params = parseInput(teacherCourseTopicLessonParamsSchema, {
        courseId,
        topicId,
        lessonId,
      });
      const request = parseInput(updateTeacherLessonRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);

      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const result = await lessonRepository.updateLesson(
        params.courseId,
        params.topicId,
        params.lessonId,
        teacherId,
        request,
      );

      return handleUpdateResult(result);
    },

    async reorderLessons(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      input: unknown,
    ): Promise<TeacherLessonListResponse> {
      const params = parseInput(teacherTopicLessonCollectionParamsSchema, {
        courseId,
        topicId,
      });
      const request: ReorderTeacherLessonsRequest = parseInput(
        reorderTeacherLessonsRequestSchema,
        input,
      );
      const teacherId = await resolveTeacherProfile(userId);
      const course = await requireOwnedCourse(params.courseId, teacherId);

      requireDraftCourse(course.status);
      await requireOwnedTopic(params.courseId, params.topicId, teacherId);

      const result = await lessonRepository.reorderTopicLessons(
        params.courseId,
        params.topicId,
        teacherId,
        request.lessonIds,
      );

      if (result.kind === "not_found") {
        throw new TeacherTopicNotFoundError();
      }
      if (result.kind === "not_editable") {
        throw new TeacherCourseNotEditableError();
      }
      if (result.kind === "invalid_order") {
        throw new LessonOrderMismatchError();
      }
      if (result.kind === "conflict") {
        throw new LessonReorderConflictError();
      }

      return teacherLessonListResponseSchema.parse({ items: result.lessons });
    },
  };
}
