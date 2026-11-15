import { z } from "zod";

export const educationStageSchema = z.enum([
  "lower_secondary",
  "upper_secondary",
]);

export const academicLevelResponseSchema = z
  .object({
    id: z.uuid(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(100),
    educationStage: educationStageSchema,
    sortOrder: z.number().int().positive(),
  })
  .strict();

export const academicLevelListResponseSchema = z
  .object({
    items: z.array(academicLevelResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].sortOrder >= items[index].sortOrder) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "sortOrder"],
          message: "Academic levels must be ordered by ascending sortOrder.",
        });
      }
    }
  });

export type EducationStage = z.infer<typeof educationStageSchema>;
export type AcademicLevelResponse = z.infer<typeof academicLevelResponseSchema>;
export type AcademicLevelListResponse = z.infer<
  typeof academicLevelListResponseSchema
>;
