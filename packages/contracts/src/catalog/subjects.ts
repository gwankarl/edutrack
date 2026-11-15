import { z } from "zod";

export const subjectResponseSchema = z
  .object({
    id: z.uuid(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(100),
    sortOrder: z.number().int().positive(),
  })
  .strict();

/**
 * Subject lists are ordered alphabetically by name, then by stable code.
 * The repository enforces this database-collation-aware ordering.
 */
export const subjectListResponseSchema = z
  .object({
    items: z.array(subjectResponseSchema),
  })
  .strict();

export type SubjectResponse = z.infer<typeof subjectResponseSchema>;
export type SubjectListResponse = z.infer<typeof subjectListResponseSchema>;
