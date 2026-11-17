import {
  teacherDashboardSummaryResponseSchema,
  type TeacherDashboardSummaryResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";

export async function getTeacherDashboardSummary(): Promise<TeacherDashboardSummaryResponse> {
  const response = await apiRequest<unknown>(
    "/api/v1/teacher/dashboard/summary",
  );

  try {
    return teacherDashboardSummaryResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected Teacher dashboard response.",
    });
  }
}
