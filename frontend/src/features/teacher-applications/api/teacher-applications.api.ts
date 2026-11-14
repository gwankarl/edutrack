import {
  getMyTeacherApplicationResponseSchema,
  submitTeacherApplicationRequestSchema,
  teacherApplicationResponseSchema,
  type GetMyTeacherApplicationResponse,
  type SubmitTeacherApplicationRequest,
  type TeacherApplicationResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";

export async function submitTeacherApplication(
  input: SubmitTeacherApplicationRequest,
): Promise<TeacherApplicationResponse> {
  const request = submitTeacherApplicationRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/teacher-applications", {
    method: "POST",
    body: request,
  });

  try {
    return teacherApplicationResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 201,
      title: "Invalid response",
      detail: "The server returned an unexpected application response.",
    });
  }
}

export async function getMyTeacherApplication(): Promise<GetMyTeacherApplicationResponse> {
  const response = await apiRequest<unknown>("/api/v1/teacher-applications/me");

  try {
    return getMyTeacherApplicationResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected application response.",
    });
  }
}
