import { and, asc, eq, max } from "drizzle-orm";

import type {
  CreateTeacherQuizQuestionRequest,
  TeacherQuizQuestionListResponse,
  TeacherQuizQuestionResponse,
  UpdateTeacherQuizQuestionRequest,
} from "@edutrack/contracts";
import { teacherQuizQuestionListResponseSchema } from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { courses } from "../../infrastructure/database/schema/courses.js";
import { quizOptions } from "../../infrastructure/database/schema/quiz-options.js";
import { quizQuestions } from "../../infrastructure/database/schema/quiz-questions.js";
import { quizzes } from "../../infrastructure/database/schema/quizzes.js";
import { topics } from "../../infrastructure/database/schema/topics.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateQuizQuestionResult =
  | { kind: "created"; question: TeacherQuizQuestionResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict" };

export type UpdateQuizQuestionResult =
  | { kind: "updated"; question: TeacherQuizQuestionResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" };

export type ReorderQuizQuestionsResult =
  | { kind: "reordered"; questions: TeacherQuizQuestionResponse[] }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "invalid_order" }
  | { kind: "conflict" };

function withTransaction<T>(
  database: DatabaseExecutor,
  operation: (transaction: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  if ("transaction" in database) {
    return database.transaction((transaction) => operation(transaction));
  }

  return operation(database);
}

/**
 * Locks the teacher-owned course associated with a quiz. Locking the course
 * serializes question mutations and prevents a concurrent status change from
 * racing a Draft-only write.
 */
async function lockDraftCourseForQuiz(
  database: DatabaseExecutor,
  quizId: string,
  teacherId: string,
): Promise<"editable" | "not_found" | "not_editable"> {
  const [course] = await database
    .select({ id: courses.id, status: courses.status })
    .from(courses)
    .innerJoin(topics, eq(topics.courseId, courses.id))
    .innerJoin(quizzes, eq(quizzes.topicId, topics.id))
    .where(and(eq(quizzes.id, quizId), eq(courses.teacherId, teacherId)))
    .for("update", { of: courses })
    .limit(1);

  if (!course) return "not_found";
  return course.status === "draft" ? "editable" : "not_editable";
}

function selectQuestionRows(database: DatabaseExecutor) {
  return database
    .select({
      id: quizQuestions.id,
      quizId: quizQuestions.quizId,
      questionText: quizQuestions.questionText,
      position: quizQuestions.position,
      createdAt: quizQuestions.createdAt,
      updatedAt: quizQuestions.updatedAt,
      optionId: quizOptions.id,
      optionQuestionId: quizOptions.questionId,
      optionText: quizOptions.optionText,
      optionPosition: quizOptions.position,
      optionIsCorrect: quizOptions.isCorrect,
    })
    .from(quizQuestions)
    .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
    .innerJoin(topics, eq(topics.id, quizzes.topicId))
    .innerJoin(courses, eq(courses.id, topics.courseId))
    .leftJoin(quizOptions, eq(quizOptions.questionId, quizQuestions.id));
}

type QuestionRow = Awaited<ReturnType<typeof selectQuestionRows>>[number];

function toQuestionResponses(
  rows: QuestionRow[],
): TeacherQuizQuestionResponse[] {
  const grouped = new Map<string, TeacherQuizQuestionResponse>();

  for (const row of rows) {
    let question = grouped.get(row.id);

    if (!question) {
      question = {
        id: row.id,
        quizId: row.quizId,
        questionText: row.questionText,
        position: row.position,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        options: [],
      };
      grouped.set(row.id, question);
    }

    if (
      row.optionId &&
      row.optionQuestionId &&
      row.optionText !== null &&
      row.optionPosition !== null &&
      row.optionIsCorrect !== null
    ) {
      question.options.push({
        id: row.optionId,
        questionId: row.optionQuestionId,
        optionText: row.optionText,
        position: row.optionPosition,
        isCorrect: row.optionIsCorrect,
      });
    }
  }

  return [...grouped.values()];
}

function isQuestionPositionConflict(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "quiz_questions_quiz_position_unique"
    ) {
      return true;
    }

    if (candidate.cause === current) break;
    current = candidate.cause;
  }

  return false;
}

export function createQuizQuestionRepository(database: DatabaseExecutor) {
  return {
    async quizExistsForTeacher(
      quizId: string,
      teacherId: string,
    ): Promise<boolean> {
      const [quiz] = await database
        .select({ id: quizzes.id })
        .from(quizzes)
        .innerJoin(topics, eq(topics.id, quizzes.topicId))
        .innerJoin(courses, eq(courses.id, topics.courseId))
        .where(and(eq(quizzes.id, quizId), eq(courses.teacherId, teacherId)))
        .limit(1);

      return quiz !== undefined;
    },

    async createQuestion(
      quizId: string,
      teacherId: string,
      data: CreateTeacherQuizQuestionRequest,
    ): Promise<CreateQuizQuestionResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuiz(
            transaction,
            quizId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const [positionResult] = await transaction
            .select({ maxPosition: max(quizQuestions.position) })
            .from(quizQuestions)
            .where(eq(quizQuestions.quizId, quizId));

          const position = (positionResult?.maxPosition ?? 0) + 1;

          const [created] = await transaction
            .insert(quizQuestions)
            .values({
              quizId,
              questionText: data.questionText,
              position,
            })
            .returning({ id: quizQuestions.id });

          if (!created) throw new Error("Question insert returned no row.");

          const rows = await selectQuestionRows(transaction)
            .where(
              and(
                eq(quizQuestions.id, created.id),
                eq(quizzes.id, quizId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .orderBy(asc(quizOptions.position), asc(quizOptions.id));

          const [question] = toQuestionResponses(rows);
          if (!question) throw new Error("Created question could not be read.");

          return { kind: "created", question };
        });
      } catch (error) {
        if (isQuestionPositionConflict(error)) return { kind: "conflict" };
        throw error;
      }
    },

    async listQuizQuestions(
      quizId: string,
      teacherId: string,
    ): Promise<TeacherQuizQuestionListResponse> {
      const rows = await selectQuestionRows(database)
        .where(and(eq(quizzes.id, quizId), eq(courses.teacherId, teacherId)))
        .orderBy(
          asc(quizQuestions.position),
          asc(quizQuestions.id),
          asc(quizOptions.position),
          asc(quizOptions.id),
        );

      return teacherQuizQuestionListResponseSchema.parse({
        items: toQuestionResponses(rows),
      });
    },

    async getQuestionById(
      quizId: string,
      questionId: string,
      teacherId: string,
    ): Promise<TeacherQuizQuestionResponse | null> {
      const rows = await selectQuestionRows(database)
        .where(
          and(
            eq(quizzes.id, quizId),
            eq(quizQuestions.id, questionId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .orderBy(asc(quizOptions.position), asc(quizOptions.id));

      return toQuestionResponses(rows)[0] ?? null;
    },

    async updateQuestion(
      quizId: string,
      questionId: string,
      teacherId: string,
      data: UpdateTeacherQuizQuestionRequest,
    ): Promise<UpdateQuizQuestionResult> {
      return withTransaction(database, async (transaction) => {
        const access = await lockDraftCourseForQuiz(
          transaction,
          quizId,
          teacherId,
        );
        if (access !== "editable") return { kind: access };

        const [updated] = await transaction
          .update(quizQuestions)
          .set({ ...data, updatedAt: new Date() })
          .where(
            and(
              eq(quizQuestions.id, questionId),
              eq(quizQuestions.quizId, quizId),
            ),
          )
          .returning({ id: quizQuestions.id });

        if (!updated) return { kind: "not_found" };

        const rows = await selectQuestionRows(transaction)
          .where(
            and(
              eq(quizQuestions.id, questionId),
              eq(quizzes.id, quizId),
              eq(courses.teacherId, teacherId),
            ),
          )
          .orderBy(asc(quizOptions.position), asc(quizOptions.id));

        const [question] = toQuestionResponses(rows);
        if (!question) return { kind: "not_found" };

        return { kind: "updated", question };
      });
    },

    async reorderQuizQuestions(
      quizId: string,
      teacherId: string,
      questionIds: string[],
    ): Promise<ReorderQuizQuestionsResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuiz(
            transaction,
            quizId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const current = await transaction
            .select({ id: quizQuestions.id, position: quizQuestions.position })
            .from(quizQuestions)
            .where(eq(quizQuestions.quizId, quizId))
            .orderBy(asc(quizQuestions.position), asc(quizQuestions.id));
          const existingIds = new Set(current.map(({ id }) => id));
          if (
            new Set(questionIds).size !== questionIds.length ||
            questionIds.length !== current.length ||
            questionIds.some((id) => !existingIds.has(id))
          ) {
            return { kind: "invalid_order" };
          }

          const maxPosition = current.reduce(
            (maximum, question) => Math.max(maximum, question.position),
            0,
          );
          if (maxPosition + current.length > 2_147_483_647) {
            return { kind: "conflict" };
          }

          const updatedAt = new Date();
          for (const [index, question] of current.entries()) {
            await transaction
              .update(quizQuestions)
              .set({ position: maxPosition + index + 1, updatedAt })
              .where(
                and(
                  eq(quizQuestions.id, question.id),
                  eq(quizQuestions.quizId, quizId),
                ),
              );
          }
          for (const [index, questionId] of questionIds.entries()) {
            await transaction
              .update(quizQuestions)
              .set({ position: index + 1, updatedAt })
              .where(
                and(
                  eq(quizQuestions.id, questionId),
                  eq(quizQuestions.quizId, quizId),
                ),
              );
          }

          const rows = await selectQuestionRows(transaction)
            .where(
              and(eq(quizzes.id, quizId), eq(courses.teacherId, teacherId)),
            )
            .orderBy(
              asc(quizQuestions.position),
              asc(quizQuestions.id),
              asc(quizOptions.position),
              asc(quizOptions.id),
            );
          return { kind: "reordered", questions: toQuestionResponses(rows) };
        });
      } catch (error) {
        if (isQuestionPositionConflict(error)) return { kind: "conflict" };
        throw error;
      }
    },
  };
}
