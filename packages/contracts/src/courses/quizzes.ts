import { z } from "zod";

import { teacherCourseTopicParamsSchema } from "./topics.js";

export const QUIZ_TITLE_MAX_LENGTH = 160;
export const QUIZ_DESCRIPTION_MAX_LENGTH = 5_000;
export const QUIZ_QUESTION_TEXT_MAX_LENGTH = 5_000;
export const QUIZ_OPTION_TEXT_MAX_LENGTH = 1_000;

export const createTeacherQuizRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(QUIZ_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(QUIZ_DESCRIPTION_MAX_LENGTH)
      .optional(),
  })
  .strict();

export const updateTeacherQuizRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(QUIZ_TITLE_MAX_LENGTH).optional(),
    // null clears the optional database description.
    description: z
      .string()
      .trim()
      .min(1)
      .max(QUIZ_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one quiz field to update.",
      });
    }
  });

export const teacherTopicQuizCollectionParamsSchema =
  teacherCourseTopicParamsSchema;

export const teacherTopicQuizParamsSchema =
  teacherCourseTopicParamsSchema.extend({
    quizId: z.uuid(),
  });

export const reorderTeacherQuizzesRequestSchema = z
  .object({
    quizIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ quizIds }, context) => {
    if (new Set(quizIds).size !== quizIds.length) {
      context.addIssue({
        code: "custom",
        path: ["quizIds"],
        message: "Quiz IDs must not contain duplicates.",
      });
    }
  });

export const teacherQuizResponseSchema = z
  .object({
    id: z.uuid(),
    topicId: z.uuid(),
    title: z.string().trim().min(1).max(QUIZ_TITLE_MAX_LENGTH),
    description: z
      .string()
      .trim()
      .min(1)
      .max(QUIZ_DESCRIPTION_MAX_LENGTH)
      .nullable(),
    position: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const teacherQuizListResponseSchema = z
  .object({
    items: z.array(teacherQuizResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].position >= items[index].position) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "position"],
          message: "Quizzes must be ordered by ascending position.",
        });
      }
    }
  });

export const createTeacherQuizQuestionRequestSchema = z
  .object({
    questionText: z.string().trim().min(1).max(QUIZ_QUESTION_TEXT_MAX_LENGTH),
  })
  .strict();

export const updateTeacherQuizQuestionRequestSchema = z
  .object({
    questionText: z
      .string()
      .trim()
      .min(1)
      .max(QUIZ_QUESTION_TEXT_MAX_LENGTH)
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.questionText === undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide question text to update.",
      });
    }
  });

export const teacherQuizQuestionCollectionParamsSchema = z
  .object({
    quizId: z.uuid(),
  })
  .strict();

export const teacherQuizQuestionParamsSchema = z
  .object({
    quizId: z.uuid(),
    questionId: z.uuid(),
  })
  .strict();

export const reorderTeacherQuizQuestionsRequestSchema = z
  .object({
    questionIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ questionIds }, context) => {
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["questionIds"],
        message: "Question IDs must not contain duplicates.",
      });
    }
  });

export const createTeacherQuizOptionRequestSchema = z
  .object({
    optionText: z.string().trim().min(1).max(QUIZ_OPTION_TEXT_MAX_LENGTH),
    // Omitted values use the database default of false.
    isCorrect: z.boolean().optional(),
  })
  .strict();

export const updateTeacherQuizOptionRequestSchema = z
  .object({
    optionText: z
      .string()
      .trim()
      .min(1)
      .max(QUIZ_OPTION_TEXT_MAX_LENGTH)
      .optional(),
    isCorrect: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.optionText === undefined && input.isCorrect === undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one option field to update.",
      });
    }
  });

export const teacherQuizOptionParamsSchema = z
  .object({
    questionId: z.uuid(),
    optionId: z.uuid(),
  })
  .strict();

export const reorderTeacherQuizOptionsRequestSchema = z
  .object({
    optionIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ optionIds }, context) => {
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["optionIds"],
        message: "Option IDs must not contain duplicates.",
      });
    }
  });

export const teacherQuizOptionResponseSchema = z
  .object({
    id: z.uuid(),
    questionId: z.uuid(),
    optionText: z.string().trim().min(1).max(QUIZ_OPTION_TEXT_MAX_LENGTH),
    position: z.number().int().positive(),
    isCorrect: z.boolean(),
  })
  .strict();

export const teacherQuizOptionListResponseSchema = z
  .array(teacherQuizOptionResponseSchema)
  .superRefine((options, context) => {
    for (let index = 1; index < options.length; index += 1) {
      if (options[index - 1].position >= options[index].position) {
        context.addIssue({
          code: "custom",
          path: [index, "position"],
          message: "Options must be ordered by ascending position.",
        });
      }
    }
  });

/**
 * Authoring responses include correctness data for teachers. Never reuse this
 * response contract for student-facing assessment endpoints.
 */
export const teacherQuizQuestionResponseSchema = z
  .object({
    id: z.uuid(),
    quizId: z.uuid(),
    questionText: z.string().trim().min(1).max(QUIZ_QUESTION_TEXT_MAX_LENGTH),
    position: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    options: teacherQuizOptionListResponseSchema,
  })
  .strict();

export const teacherQuizQuestionListResponseSchema = z
  .object({
    items: z.array(teacherQuizQuestionResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].position >= items[index].position) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "position"],
          message: "Questions must be ordered by ascending position.",
        });
      }
    }
  });

export const teacherQuizDetailResponseSchema = teacherQuizResponseSchema.extend(
  {
    questions: z.array(teacherQuizQuestionResponseSchema),
  },
);

export type CreateTeacherQuizRequest = z.infer<
  typeof createTeacherQuizRequestSchema
>;
export type UpdateTeacherQuizRequest = z.infer<
  typeof updateTeacherQuizRequestSchema
>;
export type TeacherTopicQuizCollectionParams = z.infer<
  typeof teacherTopicQuizCollectionParamsSchema
>;
export type TeacherTopicQuizParams = z.infer<
  typeof teacherTopicQuizParamsSchema
>;
export type ReorderTeacherQuizzesRequest = z.infer<
  typeof reorderTeacherQuizzesRequestSchema
>;
export type TeacherQuizResponse = z.infer<typeof teacherQuizResponseSchema>;
export type TeacherQuizListResponse = z.infer<
  typeof teacherQuizListResponseSchema
>;
export type TeacherQuizDetailResponse = z.infer<
  typeof teacherQuizDetailResponseSchema
>;

export type CreateTeacherQuizQuestionRequest = z.infer<
  typeof createTeacherQuizQuestionRequestSchema
>;
export type UpdateTeacherQuizQuestionRequest = z.infer<
  typeof updateTeacherQuizQuestionRequestSchema
>;
export type TeacherQuizQuestionCollectionParams = z.infer<
  typeof teacherQuizQuestionCollectionParamsSchema
>;
export type TeacherQuizQuestionParams = z.infer<
  typeof teacherQuizQuestionParamsSchema
>;
export type ReorderTeacherQuizQuestionsRequest = z.infer<
  typeof reorderTeacherQuizQuestionsRequestSchema
>;
export type TeacherQuizQuestionResponse = z.infer<
  typeof teacherQuizQuestionResponseSchema
>;
export type TeacherQuizQuestionListResponse = z.infer<
  typeof teacherQuizQuestionListResponseSchema
>;

export type CreateTeacherQuizOptionRequest = z.infer<
  typeof createTeacherQuizOptionRequestSchema
>;
export type UpdateTeacherQuizOptionRequest = z.infer<
  typeof updateTeacherQuizOptionRequestSchema
>;
export type TeacherQuizOptionParams = z.infer<
  typeof teacherQuizOptionParamsSchema
>;
export type ReorderTeacherQuizOptionsRequest = z.infer<
  typeof reorderTeacherQuizOptionsRequestSchema
>;
export type TeacherQuizOptionResponse = z.infer<
  typeof teacherQuizOptionResponseSchema
>;
export type TeacherQuizOptionListResponse = z.infer<
  typeof teacherQuizOptionListResponseSchema
>;
