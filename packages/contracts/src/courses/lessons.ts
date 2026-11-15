import { z } from "zod";

export const LESSON_TITLE_MAX_LENGTH = 160;

/**
 * Lesson content is a JSON object, matching the existing database constraint.
 * It may be omitted or null while the parent course is a draft.
 */
export const lessonContentSchema = z.record(z.string(), z.unknown());

export const createTeacherLessonRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH),
    content: lessonContentSchema.optional(),
  })
  .strict();

export const updateTeacherLessonRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH).optional(),
    // null clears incomplete lesson content.
    content: lessonContentSchema.nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one lesson field to update.",
      });
    }
  });

export const teacherTopicLessonCollectionParamsSchema = z
  .object({
    courseId: z.uuid(),
    topicId: z.uuid(),
  })
  .strict();

export const teacherCourseTopicLessonParamsSchema = z
  .object({
    courseId: z.uuid(),
    topicId: z.uuid(),
    lessonId: z.uuid(),
  })
  .strict();

export const teacherLessonResponseSchema = z
  .object({
    id: z.uuid(),
    topicId: z.uuid(),
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH),
    content: lessonContentSchema.nullable(),
    position: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const teacherLessonListResponseSchema = z
  .object({
    items: z.array(teacherLessonResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].position >= items[index].position) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "position"],
          message: "Lessons must be ordered by ascending position.",
        });
      }
    }
  });

/** Complete ordered lesson IDs for one topic; positions remain server-owned. */
export const reorderTeacherLessonsRequestSchema = z
  .object({
    lessonIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ lessonIds }, context) => {
    if (new Set(lessonIds).size !== lessonIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lessonIds"],
        message: "Lesson IDs must not contain duplicates.",
      });
    }
  });

export type LessonContent = z.infer<typeof lessonContentSchema>;
export type CreateTeacherLessonRequest = z.infer<
  typeof createTeacherLessonRequestSchema
>;
export type UpdateTeacherLessonRequest = z.infer<
  typeof updateTeacherLessonRequestSchema
>;
export type TeacherTopicLessonCollectionParams = z.infer<
  typeof teacherTopicLessonCollectionParamsSchema
>;
export type TeacherCourseTopicLessonParams = z.infer<
  typeof teacherCourseTopicLessonParamsSchema
>;
export type TeacherLessonResponse = z.infer<typeof teacherLessonResponseSchema>;
export type TeacherLessonListResponse = z.infer<
  typeof teacherLessonListResponseSchema
>;
export type ReorderTeacherLessonsRequest = z.infer<
  typeof reorderTeacherLessonsRequestSchema
>;
