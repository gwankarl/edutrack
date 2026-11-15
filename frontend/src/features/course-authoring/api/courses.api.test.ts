import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherCourse,
  getTeacherCourse,
  listTeacherCourses,
  updateTeacherCourse,
} from "./courses.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const courseId = "550e8400-e29b-41d4-a716-446655440020";

const course = {
  id: courseId,
  title: "Introduction to Algebra",
  description: "An introduction to algebra.",
  academicLevel: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  subject: {
    id: "550e8400-e29b-41d4-a716-446655440010",
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  status: "draft" as const,
  createdAt: "2026-11-15T12:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
};

function stubJsonResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

describe("createTeacherCourse", () => {
  it("posts the validated request and parses the creation response", async () => {
    const fetchMock = stubJsonResponse(course, 201);

    await expect(
      createTeacherCourse({
        title: "  Introduction to Algebra  ",
        description: "  An introduction to algebra.  ",
        academicLevelId: course.academicLevel.id,
        subjectId: course.subject.id,
      }),
    ).resolves.toEqual(course);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          title: "Introduction to Algebra",
          description: "An introduction to algebra.",
          academicLevelId: course.academicLevel.id,
          subjectId: course.subject.id,
        }),
      }),
    );
  });

  it("rejects invalid input and server-controlled fields before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createTeacherCourse({
        title: " ",
        academicLevelId: course.academicLevel.id,
        subjectId: course.subject.id,
      }),
    ).rejects.toBeInstanceOf(ZodError);

    await expect(
      createTeacherCourse({
        title: "Algebra",
        academicLevelId: course.academicLevel.id,
        subjectId: course.subject.id,
        status: "published",
      } as never),
    ).rejects.toBeInstanceOf(ZodError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listTeacherCourses", () => {
  it("builds a paginated URL with a status filter", async () => {
    const response = {
      items: [course],
      pagination: {
        page: 2,
        pageSize: 25,
        totalItems: 26,
        totalPages: 2,
      },
    };
    const fetchMock = stubJsonResponse(response);

    await expect(
      listTeacherCourses({ status: "draft", page: 2, pageSize: 25 }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses?page=2&pageSize=25&status=draft",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("uses contract defaults and rejects invalid filters before fetching", async () => {
    const fetchMock = stubJsonResponse({
      items: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    await listTeacherCourses();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses?page=1&pageSize=20",
      expect.anything(),
    );

    const invalidFetch = vi.fn();
    vi.stubGlobal("fetch", invalidFetch);
    await expect(listTeacherCourses({ page: 0 })).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(invalidFetch).not.toHaveBeenCalled();
  });
});

describe("getTeacherCourse", () => {
  it("validates the ID and fetches the course with same-origin credentials", async () => {
    const fetchMock = stubJsonResponse(course);

    await expect(getTeacherCourse(courseId)).resolves.toEqual(course);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}`,
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("rejects an invalid ID before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTeacherCourse("not-a-uuid")).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("updateTeacherCourse", () => {
  it("patches validated data, including clearing the description", async () => {
    const fetchMock = stubJsonResponse(course);

    await expect(
      updateTeacherCourse(courseId, { description: null }),
    ).resolves.toEqual(course);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}`,
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        body: JSON.stringify({ description: null }),
      }),
    );
  });

  it("rejects empty patches and server-controlled fields before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTeacherCourse(courseId, {} as never),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      updateTeacherCourse(courseId, { teacherId: courseId } as never),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("course API errors", () => {
  it.each([400, 401, 403, 404, 409, 500])(
    "preserves Problem Details for HTTP %i",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              title: "Request failed",
              status,
              detail: "The request could not be completed.",
            }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(getTeacherCourse(courseId)).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Request failed",
        detail: "The request could not be completed.",
      });
    },
  );

  it("rejects a successful response that fails the course contract", async () => {
    stubJsonResponse({ id: "invalid" });

    await expect(getTeacherCourse(courseId)).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});
