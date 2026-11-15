import {
  adminTeacherApplicationDecisionParamsSchema,
  adminTeacherApplicationListQuerySchema,
  adminTeacherApplicationListResponseSchema,
  adminTeacherApplicationParamsSchema,
  adminTeacherApplicationResponseSchema,
  adminTeacherApplicationDecisionResponseSchema,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
  type AdminTeacherApplicationDecisionResponse,
  type AdminTeacherApplicationListQuery,
  type AdminTeacherApplicationListResponse,
  type AdminTeacherApplicationResponse,
  type ApproveTeacherApplicationRequest,
  type RejectTeacherApplicationRequest,
} from "@edutrack/contracts";

import { ApiError } from "../../../../lib/api/api-error.js";
import { apiRequest } from "../../../../lib/api/api-client.js";
import type { ApiPath } from "../../../../lib/api/api-client.js";

export type AdminTeacherApplicationListFilters =
  Partial<AdminTeacherApplicationListQuery>;

interface ParsableSchema<T> {
  parse(value: unknown): T;
}

function parseResponse<T>(schema: ParsableSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApiError({
      status: 200,
      title: "Invalid response",
      detail: "The server returned an unexpected administrator response.",
    });
  }
}

function applicationPath(applicationId: string): ApiPath {
  const params = adminTeacherApplicationParamsSchema.parse({ applicationId });

  return `/api/v1/admin/teacher-applications/${encodeURIComponent(params.applicationId)}`;
}

export async function listAdminTeacherApplications(
  filters: AdminTeacherApplicationListFilters = {},
): Promise<AdminTeacherApplicationListResponse> {
  const query = adminTeacherApplicationListQuerySchema.parse(filters);
  const searchParams = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.status) {
    searchParams.set("status", query.status);
  }

  const path =
    `/api/v1/admin/teacher-applications?${searchParams.toString()}` as ApiPath;
  const response = await apiRequest<unknown>(path);

  return parseResponse(adminTeacherApplicationListResponseSchema, response);
}

export async function getAdminTeacherApplication(
  applicationId: string,
): Promise<AdminTeacherApplicationResponse> {
  const response = await apiRequest<unknown>(applicationPath(applicationId));

  return parseResponse(adminTeacherApplicationResponseSchema, response);
}

export async function approveAdminTeacherApplication(
  applicationId: string,
  input: ApproveTeacherApplicationRequest,
): Promise<AdminTeacherApplicationDecisionResponse> {
  const params = adminTeacherApplicationDecisionParamsSchema.parse({
    applicationId,
  });
  const body = approveTeacherApplicationRequestSchema.parse(input);
  const path = `${applicationPath(params.applicationId)}/approve` as ApiPath;
  const response = await apiRequest<unknown>(path, {
    method: "POST",
    body,
  });

  return parseResponse(adminTeacherApplicationDecisionResponseSchema, response);
}

export async function rejectAdminTeacherApplication(
  applicationId: string,
  input: RejectTeacherApplicationRequest,
): Promise<AdminTeacherApplicationDecisionResponse> {
  const params = adminTeacherApplicationDecisionParamsSchema.parse({
    applicationId,
  });
  const body = rejectTeacherApplicationRequestSchema.parse(input);
  const path = `${applicationPath(params.applicationId)}/reject` as ApiPath;
  const response = await apiRequest<unknown>(path, {
    method: "POST",
    body,
  });

  return parseResponse(adminTeacherApplicationDecisionResponseSchema, response);
}
