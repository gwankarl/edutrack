import { z } from "zod";

import { academicLevelResponseSchema } from "../catalog/academic-levels.js";
import { subjectResponseSchema } from "../catalog/subjects.js";

export const COURSE_TITLE_MAX_LENGTH = 160;
export const COURSE_DESCRIPTION_MAX_LENGTH = 5_000;

export const TEACHER_COURSE_DEFAULT_PAGE = 1;
export const TEACHER_COURSE_DEFAULT_PAGE_SIZE = 20;
export const TEACHER_COURSE_MAX_PAGE_SIZE = 100;

export const courseStatusSchema = z.enum([
  "draft",
  "pending_review",
  "published",
  "rejected",
]);

export const createTeacherCourseRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(COURSE_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(COURSE_DESCRIPTION_MAX_LENGTH)
      .optional(),
    academicLevelId: z.uuid(),
    subjectId: z.uuid(),
  })
  .strict();

export const updateTeacherCourseRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(COURSE_TITLE_MAX_LENGTH).optional(),
    // null clears the optional database description.
    description: z
      .string()
      .trim()
      .min(1)
      .max(COURSE_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
    academicLevelId: z.uuid().optional(),
    subjectId: z.uuid().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one course field to update.",
      });
    }
  });

export const teacherCourseParamsSchema = z
  .object({
    courseId: z.uuid(),
  })
  .strict();

export const teacherCourseListQuerySchema = z
  .object({
    status: courseStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(TEACHER_COURSE_DEFAULT_PAGE),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(TEACHER_COURSE_MAX_PAGE_SIZE)
      .default(TEACHER_COURSE_DEFAULT_PAGE_SIZE),
  })
  .strict();

export const teacherCourseResponseSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(COURSE_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(COURSE_DESCRIPTION_MAX_LENGTH)
      .nullable(),
    academicLevel: academicLevelResponseSchema,
    subject: subjectResponseSchema,
    status: courseStatusSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const teacherCourseListResponseSchema = z
  .object({
    items: z.array(teacherCourseResponseSchema),
    pagination: z
      .object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(TEACHER_COURSE_MAX_PAGE_SIZE),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type CreateTeacherCourseRequest = z.infer<
  typeof createTeacherCourseRequestSchema
>;
export type UpdateTeacherCourseRequest = z.infer<
  typeof updateTeacherCourseRequestSchema
>;
export type TeacherCourseParams = z.infer<typeof teacherCourseParamsSchema>;
export type TeacherCourseListQuery = z.infer<
  typeof teacherCourseListQuerySchema
>;
export type TeacherCourseResponse = z.infer<typeof teacherCourseResponseSchema>;
export type TeacherCourseListResponse = z.infer<
  typeof teacherCourseListResponseSchema
>;
