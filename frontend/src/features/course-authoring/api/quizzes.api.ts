import {
  createTeacherQuizRequestSchema,
  reorderTeacherQuizzesRequestSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
  teacherQuizListResponseSchema,
  teacherQuizResponseSchema,
  updateTeacherQuizRequestSchema,
  type CreateTeacherQuizRequest,
  type ReorderTeacherQuizzesRequest,
  type TeacherQuizListResponse,
  type TeacherQuizResponse,
  type UpdateTeacherQuizRequest,
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

function quizCollectionPath(courseId: string, topicId: string): ApiPath {
  const params = teacherTopicQuizCollectionParamsSchema.parse({
    courseId,
    topicId,
  });

  return `/api/v1/teacher/courses/${encodeURIComponent(params.courseId)}/topics/${encodeURIComponent(params.topicId)}/quizzes`;
}

function quizPath(courseId: string, topicId: string, quizId: string): ApiPath {
  const params = teacherTopicQuizParamsSchema.parse({
    courseId,
    topicId,
    quizId,
  });

  return `${quizCollectionPath(params.courseId, params.topicId)}/${encodeURIComponent(params.quizId)}`;
}

export async function createTeacherQuiz(
  courseId: string,
  topicId: string,
  input: CreateTeacherQuizRequest,
): Promise<TeacherQuizResponse> {
  const request = createTeacherQuizRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    quizCollectionPath(courseId, topicId),
    { method: "POST", body: request },
  );

  return parseResponse(
    teacherQuizResponseSchema,
    response,
    "The server returned an unexpected quiz response.",
    201,
  );
}

export async function listTeacherQuizzes(
  courseId: string,
  topicId: string,
): Promise<TeacherQuizListResponse> {
  const response = await apiRequest<unknown>(
    quizCollectionPath(courseId, topicId),
  );

  return parseResponse(
    teacherQuizListResponseSchema,
    response,
    "The server returned an unexpected quiz list response.",
  );
}

export async function getTeacherQuiz(
  courseId: string,
  topicId: string,
  quizId: string,
): Promise<TeacherQuizResponse> {
  const response = await apiRequest<unknown>(
    quizPath(courseId, topicId, quizId),
  );

  return parseResponse(
    teacherQuizResponseSchema,
    response,
    "The server returned an unexpected quiz response.",
  );
}

export async function updateTeacherQuiz(
  courseId: string,
  topicId: string,
  quizId: string,
  input: UpdateTeacherQuizRequest,
): Promise<TeacherQuizResponse> {
  const request = updateTeacherQuizRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    quizPath(courseId, topicId, quizId),
    { method: "PATCH", body: request },
  );

  return parseResponse(
    teacherQuizResponseSchema,
    response,
    "The server returned an unexpected quiz response.",
  );
}

export async function reorderTeacherQuizzes(
  courseId: string,
  topicId: string,
  input: ReorderTeacherQuizzesRequest,
): Promise<TeacherQuizListResponse> {
  const request = reorderTeacherQuizzesRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    `${quizCollectionPath(courseId, topicId)}/order`,
    { method: "PUT", body: request },
  );

  return parseResponse(
    teacherQuizListResponseSchema,
    response,
    "The server returned an unexpected reordered quiz list response.",
  );
}
