import { z } from "zod";

import {
  registrationEmailSchema,
  registrationPasswordSchema,
} from "./registration.js";

const tokenSchema = z.string().min(32).max(128);

export const verifyEmailRequestSchema = z
  .object({
    token: tokenSchema,
  })
  .strict();

export const verifyEmailResponseSchema = z
  .object({
    message: z.literal("Email verified."),
  })
  .strict();

export const forgotPasswordRequestSchema = z
  .object({
    email: registrationEmailSchema,
  })
  .strict();

export const forgotPasswordResponseSchema = z
  .object({
    message: z.literal(
      "If an account exists for that email, a password reset link will be sent.",
    ),
  })
  .strict();

export const resetPasswordRequestSchema = z
  .object({
    token: tokenSchema,
    newPassword: registrationPasswordSchema,
  })
  .strict();

export const resetPasswordResponseSchema = z
  .object({
    message: z.literal("Password has been reset."),
  })
  .strict();

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<
  typeof forgotPasswordResponseSchema
>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
