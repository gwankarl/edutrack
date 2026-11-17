import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherCourse,
  getTeacherCourse,
  listTeacherCourses,
  removeTeacherCourseThumbnail,
  uploadTeacherCourseThumbnail,
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

  it("encodes trimmed search and a requested server sort in the URL", async () => {
    const response = {
      items: [course],
      pagination: {
        page: 2,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
      },
    };
    const fetchMock = stubJsonResponse(response);

    await expect(
      listTeacherCourses({
        search: "  Algebra & Geometry  ",
        status: "draft",
        sort: "title_asc",
        page: 2,
        pageSize: 25,
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher/courses?page=2&pageSize=25&status=draft&search=Algebra+%26+Geometry&sort=title_asc",
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
    await expect(listTeacherCourses({ search: "   " })).rejects.toBeInstanceOf(
      ZodError,
    );
    await expect(
      listTeacherCourses({ sort: "unknown" as never }),
    ).rejects.toBeInstanceOf(ZodError);
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

describe("course thumbnails", () => {
  it("uploads multipart file data to the authenticated course endpoint", async () => {
    const thumbnail = {
      url: "https://images.example.test/course.webp",
      width: 1600,
      height: 900,
      format: "webp",
    };
    const fetchMock = stubJsonResponse({ thumbnail });
    const file = new File([new Uint8Array([1, 2, 3])], "cover.webp", {
      type: "image/webp",
    });

    await expect(uploadTeacherCourseThumbnail(courseId, file)).resolves.toEqual(
      thumbnail,
    );

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/v1/teacher/courses/${courseId}/thumbnail`);
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("same-origin");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("file")).toBe(file);
  });

  it("removes a thumbnail with the backend's 204 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeTeacherCourseThumbnail(courseId)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/teacher/courses/${courseId}/thumbnail`,
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
      }),
    );
  });

  it("rejects invalid course IDs before making thumbnail requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "cover.webp", { type: "image/webp" });

    await expect(
      uploadTeacherCourseThumbnail("not-a-uuid", file),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(removeTeacherCourseThumbnail("not-a-uuid")).rejects.toBeInstanceOf(
      ZodError,
    );
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
