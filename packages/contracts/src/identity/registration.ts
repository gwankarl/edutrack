import { z } from "zod";

const displayNameSchema = z.string().trim().min(1).max(120);

export const registrationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const registrationPasswordSchema = z.string().min(12).max(128);

export const registrationRequestSchema = z
  .object({
    displayName: displayNameSchema,
    email: registrationEmailSchema,
    password: registrationPasswordSchema,
  })
  .strict();

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;

export const registrationResponseSchema = z
  .object({
    id: z.uuid(),
    displayName: displayNameSchema,
    email: registrationEmailSchema,
  })
  .strict();

export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
