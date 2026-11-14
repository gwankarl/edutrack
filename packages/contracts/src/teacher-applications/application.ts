import { z } from "zod";

const applicationTextSchema = z.string().trim().min(1).max(5_000);
const timestampSchema = z.iso.datetime({ offset: true });

export const teacherApplicationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const submitTeacherApplicationRequestSchema = z
  .object({
    motivation: applicationTextSchema,
    qualifications: applicationTextSchema,
  })
  .strict();

const applicationResponseFields = {
  id: z.uuid(),
  motivation: applicationTextSchema,
  qualifications: applicationTextSchema,
  submittedAt: timestampSchema,
};

const pendingTeacherApplicationResponseSchema = z
  .object({
    ...applicationResponseFields,
    status: z.literal("pending"),
    reviewedAt: z.null(),
    rejectionReason: z.null(),
  })
  .strict();

const approvedTeacherApplicationResponseSchema = z
  .object({
    ...applicationResponseFields,
    status: z.literal("approved"),
    reviewedAt: timestampSchema,
    rejectionReason: z.null(),
  })
  .strict();

const rejectedTeacherApplicationResponseSchema = z
  .object({
    ...applicationResponseFields,
    status: z.literal("rejected"),
    reviewedAt: timestampSchema,
    rejectionReason: applicationTextSchema,
  })
  .strict();

/**
 * Public application data. Administrator review notes and reviewer identity
 * are deliberately excluded.
 */
export const teacherApplicationResponseSchema = z.discriminatedUnion("status", [
  pendingTeacherApplicationResponseSchema,
  approvedTeacherApplicationResponseSchema,
  rejectedTeacherApplicationResponseSchema,
]);

export const getMyTeacherApplicationResponseSchema = z
  .object({
    application: teacherApplicationResponseSchema.nullable(),
  })
  .strict();

export type TeacherApplicationStatus = z.infer<
  typeof teacherApplicationStatusSchema
>;
export type SubmitTeacherApplicationRequest = z.infer<
  typeof submitTeacherApplicationRequestSchema
>;
export type TeacherApplicationResponse = z.infer<
  typeof teacherApplicationResponseSchema
>;
export type GetMyTeacherApplicationResponse = z.infer<
  typeof getMyTeacherApplicationResponseSchema
>;
