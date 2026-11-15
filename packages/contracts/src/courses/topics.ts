import { z } from "zod";

import { teacherCourseParamsSchema } from "./courses.js";

export const TOPIC_TITLE_MAX_LENGTH = 160;
export const TOPIC_DESCRIPTION_MAX_LENGTH = 5_000;

export const createTeacherTopicRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(TOPIC_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(TOPIC_DESCRIPTION_MAX_LENGTH)
      .optional(),
  })
  .strict();

export const updateTeacherTopicRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(TOPIC_TITLE_MAX_LENGTH).optional(),
    // null clears the optional database description.
    description: z
      .string()
      .trim()
      .min(1)
      .max(TOPIC_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one topic field to update.",
      });
    }
  });

/** Collection endpoints use the existing course ID parameter contract. */
export const teacherTopicCollectionParamsSchema = teacherCourseParamsSchema;

export const teacherCourseTopicParamsSchema = z
  .object({
    courseId: z.uuid(),
    topicId: z.uuid(),
  })
  .strict();

export const teacherTopicResponseSchema = z
  .object({
    id: z.uuid(),
    courseId: z.uuid(),
    title: z.string().trim().min(1).max(TOPIC_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(TOPIC_DESCRIPTION_MAX_LENGTH)
      .nullable(),
    position: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const teacherTopicListResponseSchema = z
  .object({
    items: z.array(teacherTopicResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].position >= items[index].position) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "position"],
          message: "Topics must be ordered by ascending position.",
        });
      }
    }
  });

/** Complete ordered topic IDs for one course; positions remain server-owned. */
export const reorderTeacherTopicsRequestSchema = z
  .object({
    topicIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ topicIds }, context) => {
    if (new Set(topicIds).size !== topicIds.length) {
      context.addIssue({
        code: "custom",
        path: ["topicIds"],
        message: "Topic IDs must not contain duplicates.",
      });
    }
  });

export type CreateTeacherTopicRequest = z.infer<
  typeof createTeacherTopicRequestSchema
>;
export type UpdateTeacherTopicRequest = z.infer<
  typeof updateTeacherTopicRequestSchema
>;
export type TeacherTopicCollectionParams = z.infer<
  typeof teacherTopicCollectionParamsSchema
>;
export type TeacherCourseTopicParams = z.infer<
  typeof teacherCourseTopicParamsSchema
>;
export type TeacherTopicResponse = z.infer<typeof teacherTopicResponseSchema>;
export type TeacherTopicListResponse = z.infer<
  typeof teacherTopicListResponseSchema
>;
export type ReorderTeacherTopicsRequest = z.infer<
  typeof reorderTeacherTopicsRequestSchema
>;
