import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AcademicLevelResponse,
  SubjectResponse,
  TeacherCourseListResponse,
  TeacherCourseResponse,
  TeacherDashboardSummaryResponse,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import type { UpdateTeacherCourseResult } from "./course.repository.js";
import {
  CourseCatalogReferenceNotFoundError,
  CourseServiceValidationError,
  createCourseService,
  TeacherCourseNotEditableError,
  TeacherCourseNotFoundError,
  TeacherNotEligibleError,
} from "./course.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const teacherId = "550e8400-e29b-41d4-a716-446655440001";
const courseId = "550e8400-e29b-41d4-a716-446655440002";
const academicLevelId = "550e8400-e29b-41d4-a716-446655440003";
const subjectId = "550e8400-e29b-41d4-a716-446655440004";

const academicLevels: AcademicLevelResponse[] = [
  {
    id: academicLevelId,
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
];

const subjects: SubjectResponse[] = [
  {
    id: subjectId,
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
];

const course: TeacherCourseResponse = {
  id: courseId,
  title: "Introduction to Algebra",
  description: null,
  academicLevel: academicLevels[0],
  subject: subjects[0],
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

function makeService() {
  const courseRepository = {
    createCourse: vi.fn(async () => course),
    listTeacherCourses: vi.fn(async () => courseList),
    getTeacherDashboardSummary: vi.fn(async () => dashboardSummary),
    getTeacherCourseById: vi.fn(
      async (): Promise<TeacherCourseResponse | null> => course,
    ),
    updateTeacherCourse: vi.fn(
      async (): Promise<UpdateTeacherCourseResult> => ({
        kind: "updated",
        course,
      }),
    ),
  };

  const teacherProfileRepository = {
    findByUserId: vi.fn(async (): Promise<{ id: string } | null> => ({
      id: teacherId,
    })),
  };

  const identityRepository = {
    findRolesByUserId: vi.fn(async (): Promise<UserRole[]> => [
      "student",
      "teacher",
    ]),
  };

  const catalogRepository = {
    listAcademicLevels: vi.fn(async () => academicLevels),
    listSubjects: vi.fn(async () => subjects),
  };

  const service = createCourseService({
    courseRepository,
    teacherProfileRepository,
    identityRepository,
    catalogRepository,
  });

  return {
    service,
    courseRepository,
    teacherProfileRepository,
    identityRepository,
    catalogRepository,
  };
}

describe("course service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a draft course with the approved profile ID as owner", async () => {
    const { service, courseRepository } = makeService();

    await expect(
      service.createCourse(userId, {
        title: "  Introduction to Algebra ",
        academicLevelId,
        subjectId,
      }),
    ).resolves.toEqual(course);

    expect(courseRepository.createCourse).toHaveBeenCalledWith({
      title: "Introduction to Algebra",
      academicLevelId,
      subjectId,
      teacherId,
    });
  });

  it("rejects users without an assigned Teacher role", async () => {
    const { service, identityRepository, courseRepository } = makeService();
    identityRepository.findRolesByUserId.mockResolvedValue(["student"]);

    await expect(
      service.createCourse(userId, {
        title: "Algebra",
        academicLevelId,
        subjectId,
      }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(courseRepository.createCourse).not.toHaveBeenCalled();
  });

  it("rejects users without a Teacher profile", async () => {
    const { service, teacherProfileRepository, courseRepository } =
      makeService();
    teacherProfileRepository.findByUserId.mockResolvedValue(null);

    await expect(
      service.createCourse(userId, {
        title: "Algebra",
        academicLevelId,
        subjectId,
      }),
    ).rejects.toBeInstanceOf(TeacherNotEligibleError);

    expect(courseRepository.createCourse).not.toHaveBeenCalled();
  });

  it("validates creation input before performing repository writes", async () => {
    const { service, courseRepository } = makeService();

    await expect(
      service.createCourse(userId, {
        title: "   ",
        academicLevelId,
        subjectId,
      }),
    ).rejects.toBeInstanceOf(CourseServiceValidationError);

    expect(courseRepository.createCourse).not.toHaveBeenCalled();
  });

  it("rejects an academic level that is absent from the catalog", async () => {
    const { service, catalogRepository, courseRepository } = makeService();
    catalogRepository.listAcademicLevels.mockResolvedValue([]);

    await expect(
      service.createCourse(userId, {
        title: "Algebra",
        academicLevelId,
        subjectId,
      }),
    ).rejects.toBeInstanceOf(CourseCatalogReferenceNotFoundError);

    expect(courseRepository.createCourse).not.toHaveBeenCalled();
  });

  it("rejects a subject that is absent from the catalog", async () => {
    const { service, catalogRepository, courseRepository } = makeService();
    catalogRepository.listSubjects.mockResolvedValue([]);

    await expect(
      service.createCourse(userId, {
        title: "Algebra",
        academicLevelId,
        subjectId,
      }),
    ).rejects.toBeInstanceOf(CourseCatalogReferenceNotFoundError);

    expect(courseRepository.createCourse).not.toHaveBeenCalled();
  });

  it("rejects an update with an unknown academic level before writing", async () => {
    const { service, catalogRepository, courseRepository } = makeService();
    catalogRepository.listAcademicLevels.mockResolvedValue([]);

    await expect(
      service.updateMyCourse(userId, courseId, { academicLevelId }),
    ).rejects.toMatchObject({
      name: "CourseCatalogReferenceNotFoundError",
      reference: "academicLevel",
    });

    expect(courseRepository.updateTeacherCourse).not.toHaveBeenCalled();
  });

  it("rejects an update with an unknown subject before writing", async () => {
    const { service, catalogRepository, courseRepository } = makeService();
    catalogRepository.listSubjects.mockResolvedValue([]);

    await expect(
      service.updateMyCourse(userId, courseId, { subjectId }),
    ).rejects.toMatchObject({
      name: "CourseCatalogReferenceNotFoundError",
      reference: "subject",
    });

    expect(courseRepository.updateTeacherCourse).not.toHaveBeenCalled();
  });

  it("lists the authenticated teacher's courses with parsed filters", async () => {
    const { service, courseRepository } = makeService();

    await expect(
      service.listMyCourses(userId, {
        status: "draft",
        page: "2",
        pageSize: "10",
      }),
    ).resolves.toEqual(courseList);

    expect(courseRepository.listTeacherCourses).toHaveBeenCalledWith(
      teacherId,
      {
        status: "draft",
        sort: "updated_desc",
        page: 2,
        pageSize: 10,
      },
    );
  });

  it("returns the dashboard summary scoped to the authenticated teacher profile", async () => {
    const { service, courseRepository, teacherProfileRepository } =
      makeService();

    await expect(service.getMyDashboardSummary(userId)).resolves.toEqual(
      dashboardSummary,
    );
    expect(teacherProfileRepository.findByUserId).toHaveBeenCalledWith(userId);
    expect(courseRepository.getTeacherDashboardSummary).toHaveBeenCalledWith(
      teacherId,
    );
  });

  it("propagates dashboard repository failures", async () => {
    const { service, courseRepository } = makeService();
    courseRepository.getTeacherDashboardSummary.mockRejectedValue(
      new Error("Synthetic repository failure."),
    );

    await expect(service.getMyDashboardSummary(userId)).rejects.toThrow(
      "Synthetic repository failure.",
    );
  });

  it("retrieves a course through the owner-scoped repository method", async () => {
    const { service, courseRepository } = makeService();

    await expect(service.getMyCourse(userId, courseId)).resolves.toEqual(
      course,
    );

    expect(courseRepository.getTeacherCourseById).toHaveBeenCalledWith(
      courseId,
      teacherId,
    );
  });

  it("returns not found when the owner-scoped lookup has no result", async () => {
    const { service, courseRepository } = makeService();
    courseRepository.getTeacherCourseById.mockResolvedValue(null);

    await expect(service.getMyCourse(userId, courseId)).rejects.toBeInstanceOf(
      TeacherCourseNotFoundError,
    );
  });

  it("updates a draft and passes only validated fields to the repository", async () => {
    const { service, courseRepository } = makeService();

    await expect(
      service.updateMyCourse(userId, courseId, {
        title: "  Updated title ",
      }),
    ).resolves.toEqual(course);

    expect(courseRepository.updateTeacherCourse).toHaveBeenCalledWith(
      courseId,
      teacherId,
      { title: "Updated title" },
    );
  });

  it("maps a concurrent status change to the non-editable error", async () => {
    const { service, courseRepository } = makeService();
    courseRepository.updateTeacherCourse.mockResolvedValue({
      kind: "not_editable",
    });

    await expect(
      service.updateMyCourse(userId, courseId, { title: "Updated title" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotEditableError);
  });

  it("hides missing and non-owned courses behind the same not-found error", async () => {
    const { service, courseRepository } = makeService();
    courseRepository.updateTeacherCourse.mockResolvedValue({
      kind: "not_found",
    });

    await expect(
      service.updateMyCourse(userId, courseId, { title: "Updated title" }),
    ).rejects.toBeInstanceOf(TeacherCourseNotFoundError);
  });
});
