import { describe, expect, it } from "vitest";

import {
  createTeacherQuizOptionRequestSchema,
  createTeacherQuizQuestionRequestSchema,
  createTeacherQuizRequestSchema,
  reorderTeacherQuizzesRequestSchema,
  reorderTeacherQuizQuestionsRequestSchema,
  reorderTeacherQuizOptionsRequestSchema,
  teacherQuizDetailResponseSchema,
  teacherQuizQuestionParamsSchema,
  teacherTopicQuizParamsSchema,
  updateTeacherQuizOptionRequestSchema,
  updateTeacherQuizQuestionRequestSchema,
  updateTeacherQuizRequestSchema,
} from "./quizzes.js";

const courseId = "00000000-0000-4000-8000-000000000001";
const topicId = "00000000-0000-4000-8000-000000000002";
const quizId = "00000000-0000-4000-8000-000000000003";
const questionId = "00000000-0000-4000-8000-000000000004";
const optionId = "00000000-0000-4000-8000-000000000005";
const timestamp = "2026-01-01T00:00:00.000Z";

describe("teacher quiz authoring contracts", () => {
  it("validates complete UUID reorder arrays and rejects duplicate IDs", () => {
    expect(
      reorderTeacherQuizzesRequestSchema.parse({ quizIds: [quizId] }),
    ).toEqual({
      quizIds: [quizId],
    });
    expect(
      reorderTeacherQuizQuestionsRequestSchema.safeParse({
        questionIds: [questionId, questionId],
      }).success,
    ).toBe(false);
    expect(
      reorderTeacherQuizOptionsRequestSchema.safeParse({ optionIds: ["bad"] })
        .success,
    ).toBe(false);
    expect(
      reorderTeacherQuizOptionsRequestSchema.parse({ optionIds: [] }),
    ).toEqual({
      optionIds: [],
    });
    expect(
      reorderTeacherQuizzesRequestSchema.safeParse({
        quizIds: [quizId],
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("trims quiz text and permits an omitted description", () => {
    expect(
      createTeacherQuizRequestSchema.parse({ title: "  Algebra quiz  " }),
    ).toEqual({ title: "Algebra quiz" });

    expect(
      createTeacherQuizRequestSchema.parse({
        title: "  Algebra quiz  ",
        description: "  Draft quiz  ",
      }),
    ).toEqual({
      title: "Algebra quiz",
      description: "Draft quiz",
    });
  });

  it("rejects blank quiz titles and server-controlled creation fields", () => {
    expect(
      createTeacherQuizRequestSchema.safeParse({ title: " " }).success,
    ).toBe(false);

    expect(
      createTeacherQuizRequestSchema.safeParse({
        title: "Algebra quiz",
        position: 1,
        topicId,
      }).success,
    ).toBe(false);
  });

  it("requires at least one quiz update field and allows clearing description", () => {
    expect(updateTeacherQuizRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTeacherQuizRequestSchema.parse({ description: null })).toEqual(
      { description: null },
    );
  });

  it("validates topic/quiz and quiz/question UUID parameters", () => {
    expect(
      teacherTopicQuizParamsSchema.safeParse({
        courseId,
        topicId,
        quizId,
      }).success,
    ).toBe(true);

    expect(
      teacherTopicQuizParamsSchema.safeParse({
        courseId,
        topicId,
        quizId: "invalid",
      }).success,
    ).toBe(false);

    expect(
      teacherQuizQuestionParamsSchema.safeParse({ quizId, questionId }).success,
    ).toBe(true);

    expect(
      teacherQuizQuestionParamsSchema.safeParse({
        quizId,
        questionId: "invalid",
      }).success,
    ).toBe(false);
  });

  it("requires meaningful question text but permits incomplete Draft questions", () => {
    expect(
      createTeacherQuizQuestionRequestSchema.parse({
        questionText: "  What is 2 + 2?  ",
      }),
    ).toEqual({ questionText: "What is 2 + 2?" });

    expect(
      createTeacherQuizQuestionRequestSchema.safeParse({
        questionText: "   ",
      }).success,
    ).toBe(false);

    expect(updateTeacherQuizQuestionRequestSchema.safeParse({}).success).toBe(
      false,
    );
  });

  it("validates answer-option creation and updates without requiring a correct answer", () => {
    expect(
      createTeacherQuizOptionRequestSchema.parse({
        optionText: "  Four  ",
      }),
    ).toEqual({ optionText: "Four" });

    expect(
      createTeacherQuizOptionRequestSchema.parse({
        optionText: "Four",
        isCorrect: true,
      }),
    ).toEqual({ optionText: "Four", isCorrect: true });

    expect(
      createTeacherQuizOptionRequestSchema.safeParse({
        optionText: " ",
      }).success,
    ).toBe(false);

    expect(updateTeacherQuizOptionRequestSchema.safeParse({}).success).toBe(
      false,
    );

    expect(
      updateTeacherQuizOptionRequestSchema.parse({ isCorrect: false }),
    ).toEqual({ isCorrect: false });
  });

  it("rejects server-controlled parent IDs and positions in option requests", () => {
    expect(
      createTeacherQuizOptionRequestSchema.safeParse({
        optionText: "Four",
        questionId,
        position: 1,
      }).success,
    ).toBe(false);

    expect(
      updateTeacherQuizOptionRequestSchema.safeParse({
        optionText: "Four",
        position: 1,
      }).success,
    ).toBe(false);
  });

  it("validates teacher detail responses including option correctness and ordering", () => {
    const response = {
      id: quizId,
      topicId,
      title: "Algebra quiz",
      description: null,
      position: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      questions: [
        {
          id: questionId,
          quizId,
          questionText: "What is 2 + 2?",
          position: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          options: [
            {
              id: optionId,
              questionId,
              optionText: "Four",
              position: 1,
              isCorrect: true,
            },
          ],
        },
      ],
    };

    expect(teacherQuizDetailResponseSchema.parse(response)).toEqual(response);

    expect(
      teacherQuizDetailResponseSchema.safeParse({
        ...response,
        questions: [
          {
            ...response.questions[0],
            options: [
              {
                ...response.questions[0].options[0],
                position: 2,
              },
              {
                ...response.questions[0].options[0],
                id: "00000000-0000-4000-8000-000000000006",
                position: 1,
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
