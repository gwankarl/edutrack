import { healthResponseSchema, type HealthResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";

export async function getBackendHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const response = await apiRequest<unknown>("/api/v1/health", {
    method: "GET",
    signal,
  });

  if (response === undefined) {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an empty health response.",
    });
  }

  try {
    return healthResponseSchema.parse(response);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected health response.",
    });
  }
}
