import { z } from "zod";

import {
  registrationEmailSchema,
  registrationPasswordSchema,
  registrationResponseSchema,
  type RegistrationResponse,
} from "./registration.js";

export const loginRequestSchema = z
  .object({
    email: registrationEmailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// Reuse the existing safe public user profile. It contains no password or session data.
export const loginResponseSchema = registrationResponseSchema;
export type LoginResponse = RegistrationResponse;

export const logoutResponseSchema = z
  .object({
    message: z.literal("Logged out."),
  })
  .strict();

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
