import {
  academicLevelListResponseSchema,
  subjectListResponseSchema,
  type AcademicLevelListResponse,
  type SubjectListResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";

function parseResponse<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
  detail: string,
): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail,
    });
  }
}

export async function getAcademicLevels(): Promise<AcademicLevelListResponse> {
  const response = await apiRequest<unknown>("/api/v1/academic-levels");

  return parseResponse(
    academicLevelListResponseSchema,
    response,
    "The server returned an unexpected academic levels response.",
  );
}

export async function getSubjects(): Promise<SubjectListResponse> {
  const response = await apiRequest<unknown>("/api/v1/subjects");

  return parseResponse(
    subjectListResponseSchema,
    response,
    "The server returned an unexpected subjects response.",
  );
}
