import { describe, expect, it } from "vitest";

import {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_SEARCH_MAX_LENGTH,
  COURSE_TITLE_MAX_LENGTH,
  TEACHER_COURSE_DEFAULT_PAGE,
  TEACHER_COURSE_DEFAULT_PAGE_SIZE,
  createTeacherCourseRequestSchema,
  teacherCourseListQuerySchema,
  teacherCourseListResponseSchema,
  courseThumbnailResponseSchema,
  teacherCourseParamsSchema,
  teacherCourseResponseSchema,
  teacherDashboardSummaryResponseSchema,
  updateTeacherCourseRequestSchema,
} from "./courses.js";

const academicLevelId = "550e8400-e29b-41d4-a716-446655440001";
const subjectId = "550e8400-e29b-41d4-a716-446655440010";
const courseId = "550e8400-e29b-41d4-a716-446655440020";

const courseResponse = {
  id: courseId,
  title: "Introduction to Algebra",
  description: "An introduction to algebraic concepts.",
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
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
} as const;

describe("createTeacherCourseRequestSchema", () => {
  it("trims and accepts valid required fields with an optional description", () => {
    expect(
      createTeacherCourseRequestSchema.parse({
        title: "  Algebra  ",
        description: "  Introduction to algebra.  ",
        academicLevelId,
        subjectId,
      }),
    ).toEqual({
      title: "Algebra",
      description: "Introduction to algebra.",
      academicLevelId,
      subjectId,
    });

    expect(
      createTeacherCourseRequestSchema.parse({
        title: "Algebra",
        academicLevelId,
        subjectId,
      }),
    ).toEqual({ title: "Algebra", academicLevelId, subjectId });
  });

  it("accepts the title and description length limits", () => {
    expect(
      createTeacherCourseRequestSchema.safeParse({
        title: "T".repeat(COURSE_TITLE_MAX_LENGTH),
        description: "D".repeat(COURSE_DESCRIPTION_MAX_LENGTH),
        academicLevelId,
        subjectId,
      }).success,
    ).toBe(true);
  });

  it("rejects blank text, excessive lengths, invalid UUIDs, and server-owned fields", () => {
    const validInput = {
      title: "Algebra",
      academicLevelId,
      subjectId,
    };

    expect(
      createTeacherCourseRequestSchema.safeParse({
        ...validInput,
        title: "   ",
      }).success,
    ).toBe(false);

    expect(
      createTeacherCourseRequestSchema.safeParse({
        ...validInput,
        title: "T".repeat(COURSE_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);

    expect(
      createTeacherCourseRequestSchema.safeParse({
        ...validInput,
        academicLevelId: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      createTeacherCourseRequestSchema.safeParse({
        ...validInput,
        teacherId: "550e8400-e29b-41d4-a716-446655440099",
      }).success,
    ).toBe(false);

    expect(
      createTeacherCourseRequestSchema.safeParse({
        ...validInput,
        status: "published",
      }).success,
    ).toBe(false);
  });
});

describe("updateTeacherCourseRequestSchema", () => {
  it("accepts partial updates and allows clearing the description", () => {
    expect(
      updateTeacherCourseRequestSchema.parse({ title: "  New title " }),
    ).toEqual({ title: "New title" });

    expect(
      updateTeacherCourseRequestSchema.parse({ description: null }),
    ).toEqual({ description: null });

    expect(updateTeacherCourseRequestSchema.parse({ subjectId })).toEqual({
      subjectId,
    });
  });

  it("rejects an empty patch, invalid fields, and attempts to update status", () => {
    expect(updateTeacherCourseRequestSchema.safeParse({}).success).toBe(false);

    expect(
      updateTeacherCourseRequestSchema.safeParse({
        academicLevelId: "invalid",
      }).success,
    ).toBe(false);

    expect(
      updateTeacherCourseRequestSchema.safeParse({
        status: "published",
      }).success,
    ).toBe(false);

    expect(
      updateTeacherCourseRequestSchema.safeParse({
        teacherId: "550e8400-e29b-41d4-a716-446655440099",
      }).success,
    ).toBe(false);
  });
});

describe("teacherCourseParamsSchema", () => {
  it("accepts a course UUID and rejects invalid IDs or extra fields", () => {
    expect(teacherCourseParamsSchema.parse({ courseId })).toEqual({
      courseId,
    });

    expect(
      teacherCourseParamsSchema.safeParse({ courseId: "bad-id" }).success,
    ).toBe(false);

    expect(
      teacherCourseParamsSchema.safeParse({
        courseId,
        teacherId: "550e8400-e29b-41d4-a716-446655440099",
      }).success,
    ).toBe(false);
  });
});

describe("teacherCourseListQuerySchema", () => {
  it("applies pagination defaults and supports status filtering", () => {
    expect(teacherCourseListQuerySchema.parse({})).toEqual({
      sort: "updated_desc",
      page: TEACHER_COURSE_DEFAULT_PAGE,
      pageSize: TEACHER_COURSE_DEFAULT_PAGE_SIZE,
    });

    expect(
      teacherCourseListQuerySchema.parse({
        status: "draft",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      status: "draft",
      sort: "updated_desc",
      page: 2,
      pageSize: 50,
    });
  });

  it("rejects invalid status, pagination bounds, and unexpected query fields", () => {
    for (const query of [
      { status: "pending" },
      { page: "0" },
      { page: "1.5" },
      { pageSize: "0" },
      { pageSize: "101" },
      { teacherId: "550e8400-e29b-41d4-a716-446655440099" },
    ]) {
      expect(teacherCourseListQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("trims search and accepts supported sorting", () => {
    expect(
      teacherCourseListQuerySchema.parse({
        search: "  Algebra  ",
        status: "pending_review",
        sort: "title_asc",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      search: "Algebra",
      status: "pending_review",
      sort: "title_asc",
      page: 2,
      pageSize: 50,
    });
  });

  it("rejects blank or excessive searches and unsupported sorting", () => {
    for (const query of [
      { search: "   " },
      { search: "A".repeat(COURSE_SEARCH_MAX_LENGTH + 1) },
      { sort: "random" },
    ]) {
      expect(teacherCourseListQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("teacherCourseResponseSchema", () => {
  it("accepts a safe course response with catalog details", () => {
    expect(teacherCourseResponseSchema.parse(courseResponse)).toEqual(
      courseResponse,
    );
  });

  it("rejects invalid status and sensitive or unexpected fields", () => {
    expect(
      teacherCourseResponseSchema.safeParse({
        ...courseResponse,
        status: "pending",
      }).success,
    ).toBe(false);

    expect(
      teacherCourseResponseSchema.safeParse({
        ...courseResponse,
        teacherId: "550e8400-e29b-41d4-a716-446655440099",
      }).success,
    ).toBe(false);

    expect(
      teacherCourseResponseSchema.safeParse({
        ...courseResponse,
        passwordHash: "not-public",
      }).success,
    ).toBe(false);
  });
});

describe("teacherCourseListResponseSchema", () => {
  it("accepts a paginated result and empty results", () => {
    expect(
      teacherCourseListResponseSchema.parse({
        items: [courseResponse],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).items,
    ).toHaveLength(1);

    expect(
      teacherCourseListResponseSchema.parse({
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      }).items,
    ).toEqual([]);
  });
});

describe("teacherDashboardSummaryResponseSchema", () => {
  const summary = {
    statusCounts: {
      total: 5,
      draft: 2,
      pendingReview: 1,
      published: 1,
      rejected: 1,
    },
    recentDraftCourses: [
      {
        id: courseId,
        title: "Algebra",
        status: "draft",
        updatedAt: "2026-11-16T10:00:00.000Z",
      },
    ],
  } as const;

  it("accepts all supported status counts and up to three recent drafts", () => {
    expect(teacherDashboardSummaryResponseSchema.parse(summary)).toEqual(
      summary,
    );
    expect(
      teacherDashboardSummaryResponseSchema.parse({
        statusCounts: {
          total: 0,
          draft: 0,
          pendingReview: 0,
          published: 0,
          rejected: 0,
        },
        recentDraftCourses: [],
      }).recentDraftCourses,
    ).toEqual([]);
  });

  it("rejects inconsistent shapes, non-draft recent courses, and more than three drafts", () => {
    expect(
      teacherDashboardSummaryResponseSchema.safeParse({
        ...summary,
        recentDraftCourses: [
          { ...summary.recentDraftCourses[0], status: "published" },
        ],
      }).success,
    ).toBe(false);

    expect(
      teacherDashboardSummaryResponseSchema.safeParse({
        ...summary,
        recentDraftCourses: Array.from({ length: 4 }, (_, index) => ({
          ...summary.recentDraftCourses[0],
          id: `550e8400-e29b-41d4-a716-4466554400${String(index).padStart(2, "0")}`,
        })),
      }).success,
    ).toBe(false);

    expect(
      teacherDashboardSummaryResponseSchema.safeParse({
        ...summary,
        statusCounts: { ...summary.statusCounts, draft: -1 },
      }).success,
    ).toBe(false);
  });
});

describe("courseThumbnailResponseSchema", () => {
  it("accepts safe Cloudinary delivery metadata", () => {
    expect(
      courseThumbnailResponseSchema.parse({
        url: "https://res.cloudinary.com/demo/image/upload/course.webp",
        width: 1280,
        height: 720,
        format: "webp",
      }),
    ).toMatchObject({ format: "webp" });
  });

  it("rejects non-HTTPS URLs, unsupported formats, and invalid dimensions", () => {
    for (const thumbnail of [
      {
        url: "http://example.test/course.png",
        width: 1,
        height: 1,
        format: "png",
      },
      {
        url: "https://example.test/course.gif",
        width: 1,
        height: 1,
        format: "gif",
      },
      {
        url: "https://example.test/course.jpg",
        width: 0,
        height: 1,
        format: "jpg",
      },
    ]) {
      expect(courseThumbnailResponseSchema.safeParse(thumbnail).success).toBe(
        false,
      );
    }
  });
});
