import { ZodError, z } from "zod";

import {
  createTeacherCourseRequestSchema,
  teacherCourseListQuerySchema,
  teacherCourseParamsSchema,
  teacherCourseListResponseSchema,
  teacherCourseResponseSchema,
  updateTeacherCourseRequestSchema,
  type AcademicLevelResponse,
  type SubjectResponse,
  type TeacherCourseListResponse,
  type TeacherCourseResponse,
  type UpdateTeacherCourseRequest,
} from "@edutrack/contracts";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import type {
  CreateCourseData,
  TeacherCourseListFilters,
  UpdateTeacherCourseResult,
} from "./course.repository.js";

export interface CourseRepository {
  createCourse(data: CreateCourseData): Promise<TeacherCourseResponse>;
  listTeacherCourses(
    teacherId: string,
    filters: TeacherCourseListFilters,
  ): Promise<TeacherCourseListResponse>;
  getTeacherCourseById(
    courseId: string,
    teacherId: string,
  ): Promise<TeacherCourseResponse | null>;
  updateTeacherCourse(
    courseId: string,
    teacherId: string,
    data: UpdateTeacherCourseRequest,
  ): Promise<UpdateTeacherCourseResult>;
}

export interface CourseTeacherProfileRepository {
  findByUserId(userId: string): Promise<{ id: string } | null>;
}

export interface CourseIdentityRepository {
  findRolesByUserId(userId: string): Promise<UserRole[]>;
}

export interface CourseCatalogRepository {
  listAcademicLevels(): Promise<AcademicLevelResponse[]>;
  listSubjects(): Promise<SubjectResponse[]>;
}

export interface CourseServiceDependencies {
  courseRepository: CourseRepository;
  teacherProfileRepository: CourseTeacherProfileRepository;
  identityRepository: CourseIdentityRepository;
  catalogRepository: CourseCatalogRepository;
}

export class CourseServiceValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Course input is invalid.");
    this.name = "CourseServiceValidationError";
  }
}

export class TeacherNotEligibleError extends Error {
  constructor() {
    super("The authenticated user does not have an approved Teacher profile.");
    this.name = "TeacherNotEligibleError";
  }
}

export class CourseCatalogReferenceNotFoundError extends Error {
  constructor(readonly reference: "academicLevel" | "subject") {
    super(`The selected ${reference} does not exist.`);
    this.name = "CourseCatalogReferenceNotFoundError";
  }
}

export class TeacherCourseNotFoundError extends Error {
  constructor() {
    // Also used for a course owned by another teacher to avoid disclosing it.
    super("Course was not found.");
    this.name = "TeacherCourseNotFoundError";
  }
}

export class TeacherCourseNotEditableError extends Error {
  constructor() {
    super("Only draft courses can be updated.");
    this.name = "TeacherCourseNotEditableError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CourseServiceValidationError(error.issues);
    }

    throw error;
  }
}

export function createCourseService({
  courseRepository,
  teacherProfileRepository,
  identityRepository,
  catalogRepository,
}: CourseServiceDependencies) {
  async function resolveTeacherProfile(userId: string): Promise<string> {
    const [roles, profile] = await Promise.all([
      identityRepository.findRolesByUserId(userId),
      teacherProfileRepository.findByUserId(userId),
    ]);

    if (!roles.includes("teacher") || !profile) {
      throw new TeacherNotEligibleError();
    }

    return profile.id;
  }

  async function validateCatalogReferences(input: {
    academicLevelId?: string;
    subjectId?: string;
  }): Promise<void> {
    const [academicLevels, subjects] = await Promise.all([
      input.academicLevelId === undefined
        ? null
        : catalogRepository.listAcademicLevels(),
      input.subjectId === undefined ? null : catalogRepository.listSubjects(),
    ]);

    if (
      input.academicLevelId !== undefined &&
      !academicLevels?.some(({ id }) => id === input.academicLevelId)
    ) {
      throw new CourseCatalogReferenceNotFoundError("academicLevel");
    }

    if (
      input.subjectId !== undefined &&
      !subjects?.some(({ id }) => id === input.subjectId)
    ) {
      throw new CourseCatalogReferenceNotFoundError("subject");
    }
  }

  return {
    async createCourse(
      userId: string,
      input: unknown,
    ): Promise<TeacherCourseResponse> {
      const request = parseInput(createTeacherCourseRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      await validateCatalogReferences(request);

      const course = await courseRepository.createCourse({
        ...request,
        teacherId,
      });

      return teacherCourseResponseSchema.parse(course);
    },

    async listMyCourses(
      userId: string,
      filters: unknown = {},
    ): Promise<TeacherCourseListResponse> {
      const query = parseInput(teacherCourseListQuerySchema, filters);
      const teacherId = await resolveTeacherProfile(userId);
      const result = await courseRepository.listTeacherCourses(
        teacherId,
        query,
      );

      return teacherCourseListResponseSchema.parse(result);
    },

    async getMyCourse(
      userId: string,
      courseId: unknown,
    ): Promise<TeacherCourseResponse> {
      const { courseId: validatedCourseId } = parseInput(
        teacherCourseParamsSchema,
        { courseId },
      );
      const teacherId = await resolveTeacherProfile(userId);
      const course = await courseRepository.getTeacherCourseById(
        validatedCourseId,
        teacherId,
      );

      if (!course) {
        throw new TeacherCourseNotFoundError();
      }

      return teacherCourseResponseSchema.parse(course);
    },

    async updateMyCourse(
      userId: string,
      courseId: unknown,
      input: unknown,
    ): Promise<TeacherCourseResponse> {
      const { courseId: validatedCourseId } = parseInput(
        teacherCourseParamsSchema,
        { courseId },
      );
      const request = parseInput(updateTeacherCourseRequestSchema, input);
      const teacherId = await resolveTeacherProfile(userId);

      await validateCatalogReferences(request);

      const result = await courseRepository.updateTeacherCourse(
        validatedCourseId,
        teacherId,
        request,
      );

      if (result.kind === "not_found") {
        throw new TeacherCourseNotFoundError();
      }

      if (result.kind === "not_editable") {
        throw new TeacherCourseNotEditableError();
      }

      return teacherCourseResponseSchema.parse(result.course);
    },
  };
}
