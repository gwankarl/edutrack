import {
  createTeacherLessonRequestSchema,
  reorderTeacherLessonsRequestSchema,
  teacherCourseTopicLessonParamsSchema,
  teacherTopicLessonCollectionParamsSchema,
  teacherLessonListResponseSchema,
  teacherLessonResponseSchema,
  updateTeacherLessonRequestSchema,
  type CreateTeacherLessonRequest,
  type ReorderTeacherLessonsRequest,
  type TeacherLessonListResponse,
  type TeacherLessonResponse,
  type UpdateTeacherLessonRequest,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";
import type { ApiPath } from "../../../lib/api/api-client.js";

interface ParsableSchema<T> {
  parse(value: unknown): T;
}

function parseResponse<T>(
  schema: ParsableSchema<T>,
  value: unknown,
  detail: string,
  status = 200,
): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApiError({ status, title: "Invalid response", detail });
  }
}

function lessonCollectionPath(courseId: string, topicId: string): ApiPath {
  const params = teacherTopicLessonCollectionParamsSchema.parse({
    courseId,
    topicId,
  });
  return `/api/v1/teacher/courses/${encodeURIComponent(params.courseId)}/topics/${encodeURIComponent(params.topicId)}/lessons`;
}

function lessonPath(
  courseId: string,
  topicId: string,
  lessonId: string,
): ApiPath {
  const params = teacherCourseTopicLessonParamsSchema.parse({
    courseId,
    topicId,
    lessonId,
  });
  return `${lessonCollectionPath(params.courseId, params.topicId)}/${encodeURIComponent(params.lessonId)}`;
}

export async function createTeacherLesson(
  courseId: string,
  topicId: string,
  input: CreateTeacherLessonRequest,
): Promise<TeacherLessonResponse> {
  const request = createTeacherLessonRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    lessonCollectionPath(courseId, topicId),
    { method: "POST", body: request },
  );

  return parseResponse(
    teacherLessonResponseSchema,
    response,
    "The server returned an unexpected lesson response.",
    201,
  );
}

export async function listTeacherLessons(
  courseId: string,
  topicId: string,
): Promise<TeacherLessonListResponse> {
  const response = await apiRequest<unknown>(
    lessonCollectionPath(courseId, topicId),
  );

  return parseResponse(
    teacherLessonListResponseSchema,
    response,
    "The server returned an unexpected lesson list response.",
  );
}

export async function getTeacherLesson(
  courseId: string,
  topicId: string,
  lessonId: string,
): Promise<TeacherLessonResponse> {
  const response = await apiRequest<unknown>(
    lessonPath(courseId, topicId, lessonId),
  );

  return parseResponse(
    teacherLessonResponseSchema,
    response,
    "The server returned an unexpected lesson response.",
  );
}

export async function updateTeacherLesson(
  courseId: string,
  topicId: string,
  lessonId: string,
  input: UpdateTeacherLessonRequest,
): Promise<TeacherLessonResponse> {
  const request = updateTeacherLessonRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    lessonPath(courseId, topicId, lessonId),
    { method: "PATCH", body: request },
  );

  return parseResponse(
    teacherLessonResponseSchema,
    response,
    "The server returned an unexpected lesson response.",
  );
}

export async function reorderTeacherLessons(
  courseId: string,
  topicId: string,
  input: ReorderTeacherLessonsRequest,
): Promise<TeacherLessonListResponse> {
  const params = teacherTopicLessonCollectionParamsSchema.parse({
    courseId,
    topicId,
  });
  const request = reorderTeacherLessonsRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    `${lessonCollectionPath(params.courseId, params.topicId)}/order`,
    { method: "PUT", body: request },
  );

  return parseResponse(
    teacherLessonListResponseSchema,
    response,
    "The server returned an unexpected reordered lesson list response.",
  );
}
