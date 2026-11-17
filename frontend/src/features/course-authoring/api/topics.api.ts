import {
  createTeacherTopicRequestSchema,
  reorderTeacherTopicsRequestSchema,
  teacherCourseParamsSchema,
  teacherCourseTopicParamsSchema,
  teacherTopicListResponseSchema,
  teacherTopicResponseSchema,
  updateTeacherTopicRequestSchema,
  type CreateTeacherTopicRequest,
  type ReorderTeacherTopicsRequest,
  type TeacherTopicListResponse,
  type TeacherTopicResponse,
  type UpdateTeacherTopicRequest,
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

function topicCollectionPath(courseId: string): ApiPath {
  const params = teacherCourseParamsSchema.parse({ courseId });
  return `/api/v1/teacher/courses/${encodeURIComponent(params.courseId)}/topics`;
}

function topicPath(courseId: string, topicId: string): ApiPath {
  const params = teacherCourseTopicParamsSchema.parse({ courseId, topicId });
  return `${topicCollectionPath(params.courseId)}/${encodeURIComponent(params.topicId)}`;
}

export async function createTeacherTopic(
  courseId: string,
  input: CreateTeacherTopicRequest,
): Promise<TeacherTopicResponse> {
  const request = createTeacherTopicRequestSchema.parse(input);
  const response = await apiRequest<unknown>(topicCollectionPath(courseId), {
    method: "POST",
    body: request,
  });

  return parseResponse(
    teacherTopicResponseSchema,
    response,
    "The server returned an unexpected topic response.",
    201,
  );
}

export async function listTeacherTopics(
  courseId: string,
): Promise<TeacherTopicListResponse> {
  const response = await apiRequest<unknown>(topicCollectionPath(courseId));

  return parseResponse(
    teacherTopicListResponseSchema,
    response,
    "The server returned an unexpected topic list response.",
  );
}

export async function getTeacherTopic(
  courseId: string,
  topicId: string,
): Promise<TeacherTopicResponse> {
  const response = await apiRequest<unknown>(topicPath(courseId, topicId));

  return parseResponse(
    teacherTopicResponseSchema,
    response,
    "The server returned an unexpected topic response.",
  );
}

export async function updateTeacherTopic(
  courseId: string,
  topicId: string,
  input: UpdateTeacherTopicRequest,
): Promise<TeacherTopicResponse> {
  const request = updateTeacherTopicRequestSchema.parse(input);
  const response = await apiRequest<unknown>(topicPath(courseId, topicId), {
    method: "PATCH",
    body: request,
  });

  return parseResponse(
    teacherTopicResponseSchema,
    response,
    "The server returned an unexpected topic response.",
  );
}

export async function reorderTeacherTopics(
  courseId: string,
  input: ReorderTeacherTopicsRequest,
): Promise<TeacherTopicListResponse> {
  const params = teacherCourseParamsSchema.parse({ courseId });
  const request = reorderTeacherTopicsRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    `${topicCollectionPath(params.courseId)}/order`,
    { method: "PUT", body: request },
  );

  return parseResponse(
    teacherTopicListResponseSchema,
    response,
    "The server returned an unexpected reordered topic list response.",
  );
}
