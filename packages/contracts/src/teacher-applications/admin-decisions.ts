import { z } from "zod";

import { registrationResponseSchema } from "../identity/registration.js";
import { adminTeacherApplicationParamsSchema } from "./admin.js";

export const ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH = 5_000;

const decisionTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH);

/**
 * Both decision endpoints use the same validated application ID path parameter.
 */
export const adminTeacherApplicationDecisionParamsSchema =
  adminTeacherApplicationParamsSchema;

/**
 * Review notes are administrator-only input and must not be copied into
 * applicant-facing response contracts.
 */
export const approveTeacherApplicationRequestSchema = z
  .object({
    reviewNotes: decisionTextSchema.optional(),
  })
  .strict();

export const rejectTeacherApplicationRequestSchema = z
  .object({
    rejectionReason: decisionTextSchema,
    reviewNotes: decisionTextSchema.optional(),
  })
  .strict();

/**
 * Safe acknowledgment returned after an administrator decision. The response
 * omits internal review notes and credential/session fields.
 */
export const adminTeacherApplicationDecisionResponseSchema = z
  .object({
    applicationId: z.uuid(),
    status: z.enum(["approved", "rejected"]),
    reviewedAt: z.iso.datetime({ offset: true }),
    reviewer: registrationResponseSchema,
  })
  .strict();

export type AdminTeacherApplicationDecisionParams = z.infer<
  typeof adminTeacherApplicationDecisionParamsSchema
>;
export type ApproveTeacherApplicationRequest = z.infer<
  typeof approveTeacherApplicationRequestSchema
>;
export type RejectTeacherApplicationRequest = z.infer<
  typeof rejectTeacherApplicationRequestSchema
>;
export type AdminTeacherApplicationDecisionResponse = z.infer<
  typeof adminTeacherApplicationDecisionResponseSchema
>;
