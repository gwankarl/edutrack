import { z } from "zod";

import { registrationResponseSchema } from "./registration.js";

export const currentUserRoleSchema = z.enum([
  "student",
  "teacher",
  "administrator",
]);

export const currentUserResponseSchema = registrationResponseSchema
  .extend({
    emailVerified: z.boolean(),
    accountStatus: z.string().trim().min(1).max(32),
    roles: z.array(currentUserRoleSchema),
  })
  .strict();

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
export type CurrentUserRole = z.infer<typeof currentUserRoleSchema>;
