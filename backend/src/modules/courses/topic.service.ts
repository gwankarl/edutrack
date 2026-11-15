import { ZodError, z } from "zod";

import {
  createTeacherTopicRequestSchema,
  reorderTeacherTopicsRequestSchema,
  teacherCourseParamsSchema,
  teacherCourseTopicParamsSchema,
  teacherTopicListResponseSchema,
  teacherTopicResponseSchema,
  updateTeacherTopicRequestSchema,
  type TeacherTopicListResponse,
  type TeacherTopicResponse,
  type ReorderTeacherTopicsRequest,
  type UpdateTeacherTopicRequest,
} from "@edutrack/contracts";
import {
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
  type CourseIdentityRepository,
  type CourseRepository,
  type CourseTeacherProfileRepository,
} from "./course.service.js";
import type {
  CreateTopicResult,
  ReorderTopicsResult,
  UpdateTopicResult,
} from "./topic.repository.js";

export interface TopicRepository {
  createTopic(
    courseId: string,
    teacherId: string,
    data: {
      title: string;
      description?: string;
    },
  ): Promise<CreateTopicResult>;
  listCourseTopics(
    courseId: string,
    teacherId: string,
  ): Promise<TeacherTopicResponse[]>;
  getTopicById(
    courseId: string,
    topicId: string,
    teacherId: string,
  ): Promise<TeacherTopicResponse | null>;
  updateTopic(
    courseId: string,
    topicId: string,
    teacherId: string,
    data: UpdateTeacherTopicRequest,
  ): Promise<UpdateTopicResult>;
  reorderCourseTopics(
    courseId: string,
    teacherId: string,
    topicIds: string[],
  ): Promise<ReorderTopicsResult>;
}

export interface TopicServiceDependencies {
  topicRepository: TopicRepository;
  courseRepository: Pick<CourseRepository, "getTeacherCourseById">;
  teacherProfileRepository: CourseTeacherProfileRepository;
  identityRepository: CourseIdentityRepository;
}

export class TopicServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Topic input is invalid.");
    this.name = "TopicServiceValidationError";
  }
}

export class TeacherTopicNotFoundError extends Error {
  constructor() {
    // Also used for a topic that does not belong to the requested course.
    super("Topic was not found.");
    this.name = "TeacherTopicNotFoundError";
  }
}

export class TopicPositionConflictError extends Error {
  constructor() {
    super("A topic position conflict occurred.");
    this.name = "TopicPositionConflictError";
  }
}

export class TopicOrderMismatchError extends Error {
  constructor() {
    super(
      "The topic order must contain every topic in this course exactly once.",
    );
    this.name = "TopicOrderMismatchError";
  }
}

export class TopicReorderConflictError extends Error {
  constructor() {
    super("The topic order could not be updated. Please retry the request.");
    this.name = "TopicReorderConflictError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TopicServiceValidationError(error.issues);
    }

    throw error;
  }
}

export function createTopicService({
  topicRepository,
  courseRepository,
  teacherProfileRepository,
  identityRepository,
}: TopicServiceDependencies) {
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

  async function ensureCourseOwnedByTeacher(
    courseId: string,
    teacherId: string,
  ): Promise<void> {
    const course = await courseRepository.getTeacherCourseById(
      courseId,
      teacherId,
    );

    if (!course) {
      throw new TeacherCourseNotFoundError();
    }
  }

  function handleCreateResult(result: CreateTopicResult): TeacherTopicResponse {
    if (result.kind === "not_found") {
      throw new TeacherCourseNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    if (result.kind === "conflict") {
      throw new TopicPositionConflictError();
    }

    return teacherTopicResponseSchema.parse(result.topic);
  }

  function handleUpdateResult(result: UpdateTopicResult): TeacherTopicResponse {
    if (result.kind === "not_found") {
      throw new TeacherTopicNotFoundError();
    }

    if (result.kind === "not_editable") {
      throw new TeacherCourseNotEditableError();
    }

    return teacherTopicResponseSchema.parse(result.topic);
  }

  return {
    async createTopic(
      userId: string,
      courseId: unknown,
      input: unknown,
    ): Promise<TeacherTopicResponse> {
      const { courseId: validatedCourseId } = parseInput(
        teacherCourseParamsSchema,
        { courseId },
      );
      const request = parseInput(createTeacherTopicRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      await ensureCourseOwnedByTeacher(validatedCourseId, teacherId);

      const result = await topicRepository.createTopic(
        validatedCourseId,
        teacherId,
        request,
      );

      return handleCreateResult(result);
    },

    async listCourseTopics(
      userId: string,
      courseId: unknown,
    ): Promise<TeacherTopicListResponse> {
      const { courseId: validatedCourseId } = parseInput(
        teacherCourseParamsSchema,
        { courseId },
      );
      const teacherId = await resolveTeacherProfile(userId);

      await ensureCourseOwnedByTeacher(validatedCourseId, teacherId);

      const items = await topicRepository.listCourseTopics(
        validatedCourseId,
        teacherId,
      );

      return teacherTopicListResponseSchema.parse({ items });
    },

    async getTopic(
      userId: string,
      courseId: unknown,
      topicId: unknown,
    ): Promise<TeacherTopicResponse> {
      const params = parseInput(teacherCourseTopicParamsSchema, {
        courseId,
        topicId,
      });
      const teacherId = await resolveTeacherProfile(userId);

      await ensureCourseOwnedByTeacher(params.courseId, teacherId);

      const topic = await topicRepository.getTopicById(
        params.courseId,
        params.topicId,
        teacherId,
      );

      if (!topic) {
        throw new TeacherTopicNotFoundError();
      }

      return teacherTopicResponseSchema.parse(topic);
    },

    async updateTopic(
      userId: string,
      courseId: unknown,
      topicId: unknown,
      input: unknown,
    ): Promise<TeacherTopicResponse> {
      const params = parseInput(teacherCourseTopicParamsSchema, {
        courseId,
        topicId,
      });
      const request = parseInput(updateTeacherTopicRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      await ensureCourseOwnedByTeacher(params.courseId, teacherId);

      const result = await topicRepository.updateTopic(
        params.courseId,
        params.topicId,
        teacherId,
        request,
      );

      return handleUpdateResult(result);
    },

    async reorderTopics(
      userId: string,
      courseId: unknown,
      input: unknown,
    ): Promise<TeacherTopicListResponse> {
      const { courseId: validatedCourseId } = parseInput(
        teacherCourseParamsSchema,
        { courseId },
      );
      const request: ReorderTeacherTopicsRequest = parseInput(
        reorderTeacherTopicsRequestSchema,
        input,
      );
      const teacherId = await resolveTeacherProfile(userId);

      await ensureCourseOwnedByTeacher(validatedCourseId, teacherId);

      const result = await topicRepository.reorderCourseTopics(
        validatedCourseId,
        teacherId,
        request.topicIds,
      );

      if (result.kind === "not_found") {
        throw new TeacherCourseNotFoundError();
      }
      if (result.kind === "not_editable") {
        throw new TeacherCourseNotEditableError();
      }
      if (result.kind === "invalid_order") {
        throw new TopicOrderMismatchError();
      }
      if (result.kind === "conflict") {
        throw new TopicReorderConflictError();
      }

      return teacherTopicListResponseSchema.parse({ items: result.topics });
    },
  };
}
