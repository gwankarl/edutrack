import { z } from "zod";

import { registrationResponseSchema } from "../identity/registration.js";
import { teacherApplicationStatusSchema } from "./application.js";

export const ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE = 1;
export const ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_TEACHER_APPLICATION_MAX_PAGE_SIZE = 100;

export const adminTeacherApplicationListQuerySchema = z
  .object({
    status: teacherApplicationStatusSchema.optional(),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(ADMIN_TEACHER_APPLICATION_MAX_PAGE_SIZE)
      .default(ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE_SIZE),
  })
  .strict();

export const adminTeacherApplicationParamsSchema = z
  .object({
    applicationId: z.uuid(),
  })
  .strict();

const adminTeacherApplicationFields = {
  id: z.uuid(),
  applicant: registrationResponseSchema,
  motivation: z.string().trim().min(1).max(5_000),
  qualifications: z.string().trim().min(1).max(5_000),
  submittedAt: z.iso.datetime({ offset: true }),
};

const reviewerSchema = registrationResponseSchema;

const adminPendingTeacherApplicationSchema = z
  .object({
    ...adminTeacherApplicationFields,
    status: z.literal("pending"),
    reviewedAt: z.null(),
    reviewer: z.null(),
    rejectionReason: z.null(),
    reviewNotes: z.null(),
  })
  .strict();

const adminApprovedTeacherApplicationSchema = z
  .object({
    ...adminTeacherApplicationFields,
    status: z.literal("approved"),
    reviewedAt: z.iso.datetime({ offset: true }),
    reviewer: reviewerSchema,
    rejectionReason: z.null(),
    reviewNotes: z.string().nullable(),
  })
  .strict();

const adminRejectedTeacherApplicationSchema = z
  .object({
    ...adminTeacherApplicationFields,
    status: z.literal("rejected"),
    reviewedAt: z.iso.datetime({ offset: true }),
    reviewer: reviewerSchema,
    rejectionReason: z.string().trim().min(1).max(5_000),
    reviewNotes: z.string().nullable(),
  })
  .strict();

/**
 * Full application details for administrator use, including internal review
 * notes. Do not use this schema for applicant-facing endpoints.
 */
export const adminTeacherApplicationResponseSchema = z.discriminatedUnion(
  "status",
  [
    adminPendingTeacherApplicationSchema,
    adminApprovedTeacherApplicationSchema,
    adminRejectedTeacherApplicationSchema,
  ],
);

export const adminTeacherApplicationListResponseSchema = z
  .object({
    items: z.array(adminTeacherApplicationResponseSchema),
    pagination: z
      .object({
        page: z.number().int().min(1),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(ADMIN_TEACHER_APPLICATION_MAX_PAGE_SIZE),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type AdminTeacherApplicationListQuery = z.infer<
  typeof adminTeacherApplicationListQuerySchema
>;
export type AdminTeacherApplicationParams = z.infer<
  typeof adminTeacherApplicationParamsSchema
>;
export type AdminTeacherApplicationResponse = z.infer<
  typeof adminTeacherApplicationResponseSchema
>;
export type AdminTeacherApplicationListResponse = z.infer<
  typeof adminTeacherApplicationListResponseSchema
>;
