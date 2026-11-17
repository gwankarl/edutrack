import {
  createTeacherQuizOptionRequestSchema,
  reorderTeacherQuizOptionsRequestSchema,
  teacherQuizOptionListResponseSchema,
  teacherQuizOptionParamsSchema,
  teacherQuizOptionResponseSchema,
  updateTeacherQuizOptionRequestSchema,
  type CreateTeacherQuizOptionRequest,
  type ReorderTeacherQuizOptionsRequest,
  type TeacherQuizOptionListResponse,
  type TeacherQuizOptionResponse,
  type UpdateTeacherQuizOptionRequest,
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

const createOptionParamsSchema = teacherQuizOptionParamsSchema.pick({
  questionId: true,
});

function optionCollectionPath(questionId: string): ApiPath {
  const params = createOptionParamsSchema.parse({ questionId });

  return `/api/v1/teacher/questions/${encodeURIComponent(params.questionId)}/options`;
}

function optionPath(questionId: string, optionId: string): ApiPath {
  const params = teacherQuizOptionParamsSchema.parse({
    questionId,
    optionId,
  });

  return `${optionCollectionPath(params.questionId)}/${encodeURIComponent(params.optionId)}`;
}

export async function createTeacherQuizOption(
  questionId: string,
  input: CreateTeacherQuizOptionRequest,
): Promise<TeacherQuizOptionResponse> {
  const request = createTeacherQuizOptionRequestSchema.parse(input);
  const response = await apiRequest<unknown>(optionCollectionPath(questionId), {
    method: "POST",
    body: request,
  });

  return parseResponse(
    teacherQuizOptionResponseSchema,
    response,
    "The server returned an unexpected answer option response.",
    201,
  );
}

export async function updateTeacherQuizOption(
  questionId: string,
  optionId: string,
  input: UpdateTeacherQuizOptionRequest,
): Promise<TeacherQuizOptionResponse> {
  const request = updateTeacherQuizOptionRequestSchema.parse(input);
  const response = await apiRequest<unknown>(optionPath(questionId, optionId), {
    method: "PATCH",
    body: request,
  });

  return parseResponse(
    teacherQuizOptionResponseSchema,
    response,
    "The server returned an unexpected answer option response.",
  );
}

export async function reorderTeacherQuizOptions(
  questionId: string,
  input: ReorderTeacherQuizOptionsRequest,
): Promise<TeacherQuizOptionListResponse> {
  const request = reorderTeacherQuizOptionsRequestSchema.parse(input);
  const response = await apiRequest<unknown>(
    `${optionCollectionPath(questionId)}/order`,
    { method: "PUT", body: request },
  );

  return parseResponse(
    teacherQuizOptionListResponseSchema,
    response,
    "The server returned an unexpected reordered answer option response.",
  );
}
