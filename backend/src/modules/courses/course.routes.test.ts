import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
  TeacherDashboardSummaryResponse,
} from "@edutrack/contracts";
import type { Environment } from "../../infrastructure/config/env.js";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import { courseRoutes, type CourseRouteServices } from "./course.routes.js";
import {
  CourseCatalogReferenceNotFoundError,
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
} from "./course.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const courseId = "550e8400-e29b-41d4-a716-446655440001";
const academicLevelId = "550e8400-e29b-41d4-a716-446655440002";
const subjectId = "550e8400-e29b-41d4-a716-446655440003";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const course: TeacherCourseResponse = {
  id: courseId,
  title: "Synthetic Algebra",
  description: null,
  academicLevel: {
    id: academicLevelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: subjectId,
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft",
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const courseList: TeacherCourseListResponse = {
  items: [course],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  },
};

const dashboardSummary: TeacherDashboardSummaryResponse = {
  statusCounts: {
    total: 4,
    draft: 1,
    pendingReview: 1,
    published: 1,
    rejected: 1,
  },
  recentDraftCourses: [
    {
      id: courseId,
      title: course.title,
      status: "draft",
      updatedAt: course.updatedAt,
    },
  ],
};

type AuthMode = "teacher" | "student" | "unauthenticated";

const apps: Array<ReturnType<typeof Fastify>> = [];

async function createHarness(authMode: AuthMode = "teacher") {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  const services: CourseRouteServices = {
    authenticate: async (request, reply) => {
      if (authMode === "unauthenticated") {
        reply.code(401).type("application/problem+json").send({
          type: "urn:edutrack:problem:authentication-required",
          title: "Authentication required",
          status: 401,
          detail: "A valid session is required.",
        });
        return;
      }

      request.authContext = {
        userId,
        user: {
          id: userId,
          displayName: "Synthetic Teacher",
          email: "teacher@example.test",
        },
        roles: authMode === "teacher" ? ["student", "teacher"] : ["student"],
      };
    },
    courses: {
      createCourse: vi.fn(async () => course),
      listMyCourses: vi.fn(async () => courseList),
      getMyDashboardSummary: vi.fn(async () => dashboardSummary),
      getMyCourse: vi.fn(async () => course),
      updateMyCourse: vi.fn(async () => course),
    },
  };

  await app.register(courseRoutes, {
    prefix: "/api/v1",
    environment,
    services,
  });
  apps.push(app);

  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const mutationHeaders = {
  origin: environment.FRONTEND_URL,
  "content-type": "application/json",
};

describe("course routes", () => {
  it("creates a course using the trusted authenticated user and returns 201", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher/courses",
      headers: mutationHeaders,
      payload: {
        title: "Synthetic Algebra",
        academicLevelId,
        subjectId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(course);
    expect(services.courses.createCourse).toHaveBeenCalledWith(userId, {
      title: "Synthetic Algebra",
      academicLevelId,
      subjectId,
    });
    expect(response.body).not.toContain("teacherId");
  });

  it("lists the authenticated teacher's courses with pagination", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses?status=draft&page=1&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(courseList);
    expect(services.courses.listMyCourses).toHaveBeenCalledWith(userId, {
      status: "draft",
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("uses default pagination when listing without query parameters", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses",
    });

    expect(response.statusCode).toBe(200);
    expect(services.courses.listMyCourses).toHaveBeenCalledWith(userId, {
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("parses and forwards search, status, sorting, and pagination", async () => {
    const { app, services } = await createHarness();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses?search=%20Algebra%20&status=rejected&sort=title_asc&page=2&pageSize=5",
    });

    expect(response.statusCode).toBe(200);
    expect(services.courses.listMyCourses).toHaveBeenCalledWith(userId, {
      search: "Algebra",
      status: "rejected",
      sort: "title_asc",
      page: 2,
      pageSize: 5,
    });
  });

  it("returns a summary for the authenticated teacher without accepting a teacher ID", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/dashboard/summary?teacherId=another-user",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(dashboardSummary);
    expect(services.courses.getMyDashboardSummary).toHaveBeenCalledWith(userId);
    expect(response.body).not.toContain("teacherId");
  });

  it("requires an authenticated Teacher for the dashboard summary", async () => {
    const unauthenticated = await createHarness("unauthenticated");
    const student = await createHarness("student");

    const unauthenticatedResponse = await unauthenticated.app.inject({
      method: "GET",
      url: "/api/v1/teacher/dashboard/summary",
    });
    const forbiddenResponse = await student.app.inject({
      method: "GET",
      url: "/api/v1/teacher/dashboard/summary",
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(forbiddenResponse.statusCode).toBe(403);
    expect(
      unauthenticated.services.courses.getMyDashboardSummary,
    ).not.toHaveBeenCalled();
    expect(student.services.courses.getMyDashboardSummary).not.toHaveBeenCalled();
  });

  it("does not expose database details when dashboard retrieval fails", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.courses.getMyDashboardSummary).mockRejectedValue(
      new Error("Synthetic private database diagnostic."),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/dashboard/summary",
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.body).not.toContain("Synthetic private database diagnostic.");
  });

  it("retrieves an owned course", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(course);
    expect(services.courses.getMyCourse).toHaveBeenCalledWith(userId, courseId);
  });

  it("updates a draft course with PATCH and returns 200", async () => {
    const { app, services } = await createHarness();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}`,
      headers: mutationHeaders,
      payload: { title: "Updated synthetic title" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(course);
    expect(services.courses.updateMyCourse).toHaveBeenCalledWith(
      userId,
      courseId,
      { title: "Updated synthetic title" },
    );
  });

  it("rejects invalid bodies, query parameters, and route UUIDs with 400", async () => {
    const { app, services } = await createHarness();

    const invalidBody = await app.inject({
      method: "POST",
      url: "/api/v1/teacher/courses",
      headers: mutationHeaders,
      payload: {
        title: " ",
        academicLevelId,
        subjectId,
        teacherId: userId,
        status: "published",
      },
    });
    const invalidQuery = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses?page=0",
    });
    const blankSearch = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses?search=%20%20",
    });
    const excessiveSearch = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses?search=${"a".repeat(161)}`,
    });
    const invalidSort = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses?sort=arbitrary",
    });
    const invalidId = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses/not-a-uuid",
    });
    const invalidPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}`,
      headers: mutationHeaders,
      payload: { status: "published" },
    });

    expect(invalidBody.statusCode).toBe(400);
    expect(invalidQuery.statusCode).toBe(400);
    expect(blankSearch.statusCode).toBe(400);
    expect(excessiveSearch.statusCode).toBe(400);
    expect(invalidSort.statusCode).toBe(400);
    expect(invalidId.statusCode).toBe(400);
    expect(invalidPatch.statusCode).toBe(400);
    expect(services.courses.updateMyCourse).not.toHaveBeenCalled();
    expect(invalidBody.headers["content-type"]).toContain(
      "application/problem+json",
    );
  });

  it("returns 401 for unauthenticated requests and 403 for non-teachers", async () => {
    const unauthenticated = await createHarness("unauthenticated");
    const student = await createHarness("student");

    const unauthenticatedResponse = await unauthenticated.app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses",
    });
    const forbiddenResponse = await student.app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses",
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(forbiddenResponse.statusCode).toBe(403);
  });

  it("returns 404 for missing or another teacher's course on GET and PATCH", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.courses.getMyCourse).mockRejectedValue(
      new TeacherCourseNotFoundError(),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/teacher/courses/${courseId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("another teacher");

    vi.mocked(services.courses.updateMyCourse).mockRejectedValue(
      new TeacherCourseNotFoundError(),
    );
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}`,
      headers: mutationHeaders,
      payload: { title: "Unauthorized update" },
    });

    expect(patchResponse.statusCode).toBe(404);
    expect(patchResponse.body).not.toContain("another teacher");
  });

  it("returns a safe 400 Problem Details response for invalid catalog references", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.courses.createCourse).mockRejectedValue(
      new CourseCatalogReferenceNotFoundError("subject"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/teacher/courses",
      headers: mutationHeaders,
      payload: { title: "Synthetic course", academicLevelId, subjectId },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:invalid-course-reference",
      status: 400,
    });
  });

  it("returns 409 when a concurrent transition makes a course non-editable", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.courses.updateMyCourse).mockRejectedValue(
      new TeacherCourseNotEditableError(),
    );

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}`,
      headers: mutationHeaders,
      payload: { title: "Changed title" },
    });

    expect(response.statusCode).toBe(409);
  });

  it("returns generic Problem Details when a course operation fails unexpectedly", async () => {
    const { app, services } = await createHarness();
    vi.mocked(services.courses.listMyCourses).mockRejectedValue(
      new Error("Sensitive database diagnostic."),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/teacher/courses",
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:internal-error",
      status: 500,
      detail: "An unexpected error occurred.",
    });
    expect(response.body).not.toContain("Sensitive database diagnostic.");
  });

  it("rejects cross-origin POST and PATCH before calling the service", async () => {
    const { app, services } = await createHarness();

    const foreignOriginHeaders = {
      origin: "https://attacker.example",
      "content-type": "application/json",
    };
    const postResponse = await app.inject({
      method: "POST",
      url: "/api/v1/teacher/courses",
      headers: foreignOriginHeaders,
      payload: { title: "Synthetic", academicLevelId, subjectId },
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/teacher/courses/${courseId}`,
      headers: foreignOriginHeaders,
      payload: { title: "Changed title" },
    });

    expect(postResponse.statusCode).toBe(403);
    expect(patchResponse.statusCode).toBe(403);
    expect(postResponse.json()).toMatchObject({
      type: "urn:edutrack:problem:csrf-rejected",
      status: 403,
    });
    expect(services.courses.createCourse).not.toHaveBeenCalled();
    expect(services.courses.updateMyCourse).not.toHaveBeenCalled();
  });
});
