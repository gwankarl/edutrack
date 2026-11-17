import {
  createTeacherCourseRequestSchema,
  teacherCourseListQuerySchema,
  teacherCourseListResponseSchema,
  teacherCourseParamsSchema,
  teacherCourseResponseSchema,
  updateTeacherCourseRequestSchema,
  courseThumbnailResponseSchema,
  type CourseThumbnailResponse,
  type CreateTeacherCourseRequest,
  type TeacherCourseListQuery,
  type TeacherCourseListResponse,
  type TeacherCourseResponse,
  type UpdateTeacherCourseRequest,
} from "@edutrack/contracts";
import { z } from "zod";

import { ApiError } from "../../../lib/api/api-error.js";
import { apiRequest } from "../../../lib/api/api-client.js";
import type { ApiPath } from "../../../lib/api/api-client.js";

export type TeacherCourseListFilters = Partial<TeacherCourseListQuery>;

interface ParsableSchema<T> {
  parse(value: unknown): T;
}

const thumbnailUploadResponseSchema = z
  .object({ thumbnail: courseThumbnailResponseSchema })
  .strict();

function parseResponse<T>(
  schema: ParsableSchema<T>,
  value: unknown,
  detail: string,
  status = 200,
): T {
  try {
    return schema.parse(value);
  } catch {
    throw new ApiError({
      status,
      title: "Invalid response",
      detail,
    });
  }
}

function coursePath(courseId: string): ApiPath {
  const params = teacherCourseParamsSchema.parse({ courseId });

  return `/api/v1/teacher/courses/${encodeURIComponent(params.courseId)}`;
}

export async function createTeacherCourse(
  input: CreateTeacherCourseRequest,
): Promise<TeacherCourseResponse> {
  const request = createTeacherCourseRequestSchema.parse(input);
  const response = await apiRequest<unknown>("/api/v1/teacher/courses", {
    method: "POST",
    body: request,
  });

  return parseResponse(
    teacherCourseResponseSchema,
    response,
    "The server returned an unexpected course response.",
    201,
  );
}

export async function listTeacherCourses(
  filters: TeacherCourseListFilters = {},
): Promise<TeacherCourseListResponse> {
  const query = teacherCourseListQuerySchema.parse(filters);
  const searchParams = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.status) {
    searchParams.set("status", query.status);
  }

  if (query.search) {
    searchParams.set("search", query.search);
  }

  if (query.sort !== "updated_desc") {
    searchParams.set("sort", query.sort);
  }

  const path = `/api/v1/teacher/courses?${searchParams.toString()}` as ApiPath;
  const response = await apiRequest<unknown>(path);

  return parseResponse(
    teacherCourseListResponseSchema,
    response,
    "The server returned an unexpected course list response.",
  );
}

export async function getTeacherCourse(
  courseId: string,
): Promise<TeacherCourseResponse> {
  const response = await apiRequest<unknown>(coursePath(courseId));

  return parseResponse(
    teacherCourseResponseSchema,
    response,
    "The server returned an unexpected course response.",
  );
}

export async function updateTeacherCourse(
  courseId: string,
  input: UpdateTeacherCourseRequest,
): Promise<TeacherCourseResponse> {
  const params = teacherCourseParamsSchema.parse({ courseId });
  const request = updateTeacherCourseRequestSchema.parse(input);
  const response = await apiRequest<unknown>(coursePath(params.courseId), {
    method: "PATCH",
    body: request,
  });

  return parseResponse(
    teacherCourseResponseSchema,
    response,
    "The server returned an unexpected course response.",
  );
}

export async function uploadTeacherCourseThumbnail(
  courseId: string,
  file: File,
): Promise<CourseThumbnailResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiRequest<unknown>(
    `${coursePath(courseId)}/thumbnail` as ApiPath,
    {
      method: "POST",
      body: formData,
    },
  );

  return parseResponse(
    thumbnailUploadResponseSchema,
    response,
    "The server returned an unexpected thumbnail response.",
  ).thumbnail;
}

export async function removeTeacherCourseThumbnail(
  courseId: string,
): Promise<void> {
  await apiRequest<void>(`${coursePath(courseId)}/thumbnail` as ApiPath, {
    method: "DELETE",
  });
}
