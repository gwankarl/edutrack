import { and, asc, eq, max } from "drizzle-orm";

import type {
  CreateTeacherQuizOptionRequest,
  TeacherQuizOptionResponse,
  UpdateTeacherQuizOptionRequest,
} from "@edutrack/contracts";
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

export type CreateQuizOptionResult =
  | { kind: "created"; option: TeacherQuizOptionResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict"; reason: "position" | "correct_answer" };

export type UpdateQuizOptionResult =
  | { kind: "updated"; option: TeacherQuizOptionResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict"; reason: "correct_answer" };

export type SetCorrectQuizOptionResult =
  | { kind: "updated"; option: TeacherQuizOptionResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict"; reason: "correct_answer" };

export type ReorderQuizOptionsResult =
  | { kind: "reordered"; options: TeacherQuizOptionResponse[] }
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

/** Lock the owning course before any Draft-only option mutation. */
async function lockDraftCourseForQuestion(
  database: DatabaseExecutor,
  questionId: string,
  teacherId: string,
): Promise<"editable" | "not_found" | "not_editable"> {
  const [course] = await database
    .select({ id: courses.id, status: courses.status })
    .from(courses)
    .innerJoin(topics, eq(topics.courseId, courses.id))
    .innerJoin(quizzes, eq(quizzes.topicId, topics.id))
    .innerJoin(quizQuestions, eq(quizQuestions.quizId, quizzes.id))
    .where(
      and(eq(quizQuestions.id, questionId), eq(courses.teacherId, teacherId)),
    )
    .for("update", { of: courses })
    .limit(1);

  if (!course) return "not_found";
  return course.status === "draft" ? "editable" : "not_editable";
}

function selectOptions(database: DatabaseExecutor) {
  return database
    .select({
      id: quizOptions.id,
      questionId: quizOptions.questionId,
      optionText: quizOptions.optionText,
      position: quizOptions.position,
      isCorrect: quizOptions.isCorrect,
    })
    .from(quizOptions)
    .innerJoin(quizQuestions, eq(quizQuestions.id, quizOptions.questionId))
    .innerJoin(quizzes, eq(quizzes.id, quizQuestions.quizId))
    .innerJoin(topics, eq(topics.id, quizzes.topicId))
    .innerJoin(courses, eq(courses.id, topics.courseId));
}

function toOptionResponse(
  row: Awaited<ReturnType<typeof selectOptions>>[number],
): TeacherQuizOptionResponse {
  return row;
}

function isUniqueConflict(
  error: unknown,
): "position" | "correct_answer" | null {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const candidate = errorObject(current);

    if (
      candidate.code === "23505" &&
      candidate.constraint === "quiz_options_question_position_unique"
    ) {
      return "position";
    }

    if (
      candidate.code === "23505" &&
      candidate.constraint === "quiz_options_one_correct_per_question_unique"
    ) {
      return "correct_answer";
    }

    if (candidate.cause === current) break;
    current = candidate.cause;
  }

  return null;
}

function errorObject(error: object): {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
} {
  return error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
}

export function createQuizOptionRepository(database: DatabaseExecutor) {
  return {
    /** Atomically replace the correct option while preserving the one-correct constraint. */
    async setCorrectOption(
      questionId: string,
      optionId: string,
      teacherId: string,
      data: UpdateTeacherQuizOptionRequest,
    ): Promise<SetCorrectQuizOptionResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuestion(
            transaction,
            questionId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const [target] = await selectOptions(transaction)
            .where(
              and(
                eq(quizQuestions.id, questionId),
                eq(quizOptions.id, optionId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .for("update")
            .limit(1);
          if (!target) return { kind: "not_found" };

          await transaction
            .update(quizOptions)
            .set({ isCorrect: false })
            .where(eq(quizOptions.questionId, questionId));

          const [updated] = await transaction
            .update(quizOptions)
            .set({
              ...(data.optionText === undefined
                ? {}
                : { optionText: data.optionText }),
              isCorrect: true,
            })
            .where(
              and(
                eq(quizOptions.id, optionId),
                eq(quizOptions.questionId, questionId),
              ),
            )
            .returning({ id: quizOptions.id });

          if (!updated) return { kind: "not_found" };

          const [option] = await selectOptions(transaction)
            .where(
              and(
                eq(quizOptions.id, updated.id),
                eq(quizQuestions.id, questionId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);
          if (!option) return { kind: "not_found" };

          return { kind: "updated", option: toOptionResponse(option) };
        });
      } catch (error) {
        if (isUniqueConflict(error) === "correct_answer") {
          return { kind: "conflict", reason: "correct_answer" };
        }
        throw error;
      }
    },

    async reorderQuestionOptions(
      questionId: string,
      teacherId: string,
      optionIds: string[],
    ): Promise<ReorderQuizOptionsResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuestion(
            transaction,
            questionId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const current = await transaction
            .select({ id: quizOptions.id, position: quizOptions.position })
            .from(quizOptions)
            .where(eq(quizOptions.questionId, questionId))
            .orderBy(asc(quizOptions.position), asc(quizOptions.id));
          const existingIds = new Set(current.map(({ id }) => id));
          if (
            new Set(optionIds).size !== optionIds.length ||
            optionIds.length !== current.length ||
            optionIds.some((id) => !existingIds.has(id))
          ) {
            return { kind: "invalid_order" };
          }

          const maxPosition = current.reduce(
            (maximum, option) => Math.max(maximum, option.position),
            0,
          );
          if (maxPosition + current.length > 2_147_483_647) {
            return { kind: "conflict" };
          }

          // The correct-answer partial unique index is unaffected; this writes
          // only positions. Stage above the occupied range before compacting.
          for (const [index, option] of current.entries()) {
            await transaction
              .update(quizOptions)
              .set({ position: maxPosition + index + 1 })
              .where(
                and(
                  eq(quizOptions.id, option.id),
                  eq(quizOptions.questionId, questionId),
                ),
              );
          }
          for (const [index, optionId] of optionIds.entries()) {
            await transaction
              .update(quizOptions)
              .set({ position: index + 1 })
              .where(
                and(
                  eq(quizOptions.id, optionId),
                  eq(quizOptions.questionId, questionId),
                ),
              );
          }

          const rows = await selectOptions(transaction)
            .where(
              and(
                eq(quizQuestions.id, questionId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .orderBy(asc(quizOptions.position), asc(quizOptions.id));
          return { kind: "reordered", options: rows.map(toOptionResponse) };
        });
      } catch (error) {
        if (isUniqueConflict(error) === "position") return { kind: "conflict" };
        throw error;
      }
    },

    async createOption(
      questionId: string,
      teacherId: string,
      data: CreateTeacherQuizOptionRequest,
    ): Promise<CreateQuizOptionResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuestion(
            transaction,
            questionId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const [positionResult] = await transaction
            .select({ maxPosition: max(quizOptions.position) })
            .from(quizOptions)
            .where(eq(quizOptions.questionId, questionId));

          const position = (positionResult?.maxPosition ?? 0) + 1;
          const [created] = await transaction
            .insert(quizOptions)
            .values({
              questionId,
              optionText: data.optionText,
              position,
              isCorrect: data.isCorrect ?? false,
            })
            .returning({ id: quizOptions.id });

          if (!created) throw new Error("Option insert returned no row.");

          const [row] = await selectOptions(transaction)
            .where(
              and(
                eq(quizOptions.id, created.id),
                eq(quizQuestions.id, questionId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);

          if (!row) throw new Error("Created option could not be read.");
          return { kind: "created", option: toOptionResponse(row) };
        });
      } catch (error) {
        const reason = isUniqueConflict(error);
        if (reason) {
          return reason === "position"
            ? { kind: "conflict", reason }
            : { kind: "conflict", reason };
        }
        throw error;
      }
    },

    async listQuestionOptions(
      questionId: string,
      teacherId: string,
    ): Promise<TeacherQuizOptionResponse[]> {
      const rows = await selectOptions(database)
        .where(
          and(
            eq(quizQuestions.id, questionId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .orderBy(asc(quizOptions.position), asc(quizOptions.id));

      return rows.map(toOptionResponse);
    },

    async getOptionById(
      questionId: string,
      optionId: string,
      teacherId: string,
    ): Promise<TeacherQuizOptionResponse | null> {
      const [row] = await selectOptions(database)
        .where(
          and(
            eq(quizQuestions.id, questionId),
            eq(quizOptions.id, optionId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .limit(1);

      return row ? toOptionResponse(row) : null;
    },

    async updateOption(
      questionId: string,
      optionId: string,
      teacherId: string,
      data: UpdateTeacherQuizOptionRequest,
    ): Promise<UpdateQuizOptionResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourseForQuestion(
            transaction,
            questionId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };

          const [updated] = await transaction
            .update(quizOptions)
            .set(data)
            .where(
              and(
                eq(quizOptions.id, optionId),
                eq(quizOptions.questionId, questionId),
              ),
            )
            .returning({ id: quizOptions.id });

          if (!updated) return { kind: "not_found" };

          const [row] = await selectOptions(transaction)
            .where(
              and(
                eq(quizOptions.id, optionId),
                eq(quizQuestions.id, questionId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);

          if (!row) return { kind: "not_found" };
          return { kind: "updated", option: toOptionResponse(row) };
        });
      } catch (error) {
        if (isUniqueConflict(error) === "correct_answer") {
          return { kind: "conflict", reason: "correct_answer" };
        }
        throw error;
      }
    },
  };
}
