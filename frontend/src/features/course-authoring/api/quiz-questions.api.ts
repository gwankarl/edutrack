import {
  createTeacherQuizQuestionRequestSchema,
  reorderTeacherQuizQuestionsRequestSchema,
  teacherQuizQuestionCollectionParamsSchema,
  teacherQuizQuestionListResponseSchema,
  teacherQuizQuestionParamsSchema,
  teacherQuizQuestionResponseSchema,
  updateTeacherQuizQuestionRequestSchema,
  type CreateTeacherQuizQuestionRequest,
  type ReorderTeacherQuizQuestionsRequest,
  type TeacherQuizQuestionListResponse,
  type TeacherQuizQuestionResponse,
  type UpdateTeacherQuizQuestionRequest,
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

function questionCollectionPath(quizId: string): ApiPath {
  const params = teacherQuizQuestionCollectionParamsSchema.parse({ quizId });

  return `/api/v1/teacher/quizzes/${encodeURIComponent(params.quizId)}/questions`;
}

function questionPath(quizId: string, questionId: string): ApiPath {
  const params = teacherQuizQuestionParamsSchema.parse({
    quizId,
    questionId,
  });

  return `${questionCollectionPath(params.quizId)}/${encodeURIComponent(params.questionId)}`;
}

export async function createTeacherQuizQuestion(
  quizId: string,
  input: CreateTeacherQuizQuestionRequest,
): Promise<TeacherQuizQuestionResponse> {
  const request = createTeacherQuizQuestionRequestSchema.parse(input);
  const response = await apiRequest<unknown>(questionCollectionPath(quizId), {
    method: "POST",
    body: request,
  });

  return parseResponse(
    teacherQuizQuestionResponseSchema,
    response,
    "The server returned an unexpected question response.",
    201,
  );
}

export async function listTeacherQuizQuestions(
  quizId: string,
): Promise<TeacherQuizQuestionListResponse> {
  const response = await apiRequest<unknown>(questionCollectionPath(quizId));

  return parseResponse(
    teacherQuizQuestionListResponseSchema,
    response,
    "The server returned an unexpected question list response.",
  );
}

export async function getTeacherQuizQuestion(
  quizId: string,
  questionId: string,
): Promise<TeacherQuizQuestionResponse> {
  const response = await apiRequest<unknown>(questionPath(quizId, questionId));

  return parseResponse(
    teacherQuizQuestionResponseSchema,
    response,
    "The server returned an unexpected question response.",
  );
}

export async function updateTeacherQuizQuestion(
  quizId: string,
  questionId: string,
  input: UpdateTeacherQuizQuestionRequest,
): Promise<TeacherQuizQuestionResponse> {
  const request = updateTeacherQuizQuestionRequestSchema.parse(input);
  const response = await apiRequest<unknown>(questionPath(quizId, questionId), {
    method: "PATCH",
    body: request,
  });

  return parseResponse(
    teacherQuizQuestionResponseSchema,
    response,
    "The server returned an unexpected question response.",
  );
}

export async function reorderTeacherQuizQuestions(
  quizId: string,
  input: ReorderTeacherQuizQuestionsRequest,
): Promise<TeacherQuizQuestionListResponse> {
  const params = teacherQuizQuestionCollectionParamsSchema.parse({ quizId });
  const request = reorderTeacherQuizQuestionsRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    `${questionCollectionPath(params.quizId)}/order`,
    { method: "PUT", body: request },
  );

  return parseResponse(
    teacherQuizQuestionListResponseSchema,
    response,
    "The server returned an unexpected reordered question list response.",
  );
}
