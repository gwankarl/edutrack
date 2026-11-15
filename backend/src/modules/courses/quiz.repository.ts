import { and, asc, eq, max } from "drizzle-orm";

import type {
  CreateTeacherQuizRequest,
  TeacherQuizResponse,
  UpdateTeacherQuizRequest,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { courses } from "../../infrastructure/database/schema/courses.js";
import { quizzes } from "../../infrastructure/database/schema/quizzes.js";
import { topics } from "../../infrastructure/database/schema/topics.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateQuizResult =
  | { kind: "created"; quiz: TeacherQuizResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict" };

export type UpdateQuizResult =
  | { kind: "updated"; quiz: TeacherQuizResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" };

export type ReorderQuizzesResult =
  | { kind: "reordered"; quizzes: TeacherQuizResponse[] }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "invalid_order" }
  | { kind: "conflict" };

function selectQuiz(database: DatabaseExecutor) {
  return database
    .select({
      id: quizzes.id,
      topicId: quizzes.topicId,
      title: quizzes.title,
      description: quizzes.description,
      position: quizzes.position,
      createdAt: quizzes.createdAt,
      updatedAt: quizzes.updatedAt,
    })
    .from(quizzes)
    .innerJoin(topics, eq(quizzes.topicId, topics.id))
    .innerJoin(courses, eq(topics.courseId, courses.id));
}

type QuizRow = Awaited<ReturnType<typeof selectQuiz>>[number];

function toTeacherQuizResponse(row: QuizRow): TeacherQuizResponse {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Identify only violations of the quiz position index. */
function isQuizPositionConflict(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "quizzes_topic_position_unique"
    ) {
      return true;
    }

    if (candidate.cause === current) {
      break;
    }

    current = candidate.cause;
  }

  return false;
}

/** Start a transaction for a root database; reuse an injected transaction. */
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
 * Locks a teacher-owned Draft course for the duration of a mutation. A
 * non-owned course is concealed as not_found.
 */
async function lockDraftCourse(
  database: DatabaseExecutor,
  courseId: string,
  teacherId: string,
): Promise<"editable" | "not_found" | "not_editable"> {
  const [draftCourse] = await database
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.id, courseId),
        eq(courses.teacherId, teacherId),
        eq(courses.status, "draft"),
      ),
    )
    .for("update")
    .limit(1);

  if (draftCourse) {
    return "editable";
  }

  const [ownedCourse] = await database
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.teacherId, teacherId)))
    .limit(1);

  return ownedCourse ? "not_editable" : "not_found";
}

async function topicBelongsToCourse(
  database: DatabaseExecutor,
  courseId: string,
  topicId: string,
): Promise<boolean> {
  const [topic] = await database
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.courseId, courseId)))
    .limit(1);

  return topic !== undefined;
}

/**
 * Creates quiz operations that can use either the root database or a caller's
 * active transaction.
 */
export function createQuizRepository(database: DatabaseExecutor) {
  return {
    async createQuiz(
      courseId: string,
      topicId: string,
      teacherId: string,
      data: CreateTeacherQuizRequest,
    ): Promise<CreateQuizResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourse(
            transaction,
            courseId,
            teacherId,
          );

          if (access !== "editable") {
            return { kind: access };
          }

          if (!(await topicBelongsToCourse(transaction, courseId, topicId))) {
            return { kind: "not_found" };
          }

          const [positionResult] = await transaction
            .select({ maxPosition: max(quizzes.position) })
            .from(quizzes)
            .where(eq(quizzes.topicId, topicId));

          const position = (positionResult?.maxPosition ?? 0) + 1;

          const [created] = await transaction
            .insert(quizzes)
            .values({
              topicId,
              title: data.title,
              description: data.description ?? null,
              position,
            })
            .returning({ id: quizzes.id });

          if (!created) {
            throw new Error("Quiz insert did not return a row.");
          }

          const [quiz] = await selectQuiz(transaction)
            .where(
              and(
                eq(quizzes.id, created.id),
                eq(quizzes.topicId, topicId),
                eq(topics.courseId, courseId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);

          if (!quiz) {
            throw new Error("Created quiz could not be retrieved.");
          }

          return {
            kind: "created",
            quiz: toTeacherQuizResponse(quiz),
          };
        });
      } catch (error) {
        if (isQuizPositionConflict(error)) {
          return { kind: "conflict" };
        }

        throw error;
      }
    },

    async reorderTopicQuizzes(
      courseId: string,
      topicId: string,
      teacherId: string,
      quizIds: string[],
    ): Promise<ReorderQuizzesResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockDraftCourse(
            transaction,
            courseId,
            teacherId,
          );
          if (access !== "editable") return { kind: access };
          if (!(await topicBelongsToCourse(transaction, courseId, topicId))) {
            return { kind: "not_found" };
          }

          const current = await transaction
            .select({ id: quizzes.id, position: quizzes.position })
            .from(quizzes)
            .where(eq(quizzes.topicId, topicId))
            .orderBy(asc(quizzes.position), asc(quizzes.id));
          const existingIds = new Set(current.map(({ id }) => id));
          if (
            new Set(quizIds).size !== quizIds.length ||
            quizIds.length !== current.length ||
            quizIds.some((id) => !existingIds.has(id))
          ) {
            return { kind: "invalid_order" };
          }

          const maxPosition = current.reduce(
            (maximum, quiz) => Math.max(maximum, quiz.position),
            0,
          );
          if (maxPosition + current.length > 2_147_483_647) {
            return { kind: "conflict" };
          }

          const updatedAt = new Date();
          // Stage outside the occupied range because the position index is
          // immediate and cannot defer validation until transaction commit.
          for (const [index, quiz] of current.entries()) {
            await transaction
              .update(quizzes)
              .set({ position: maxPosition + index + 1, updatedAt })
              .where(
                and(eq(quizzes.id, quiz.id), eq(quizzes.topicId, topicId)),
              );
          }
          for (const [index, quizId] of quizIds.entries()) {
            await transaction
              .update(quizzes)
              .set({ position: index + 1, updatedAt })
              .where(and(eq(quizzes.id, quizId), eq(quizzes.topicId, topicId)));
          }

          const rows = await selectQuiz(transaction)
            .where(
              and(
                eq(courses.id, courseId),
                eq(courses.teacherId, teacherId),
                eq(topics.id, topicId),
              ),
            )
            .orderBy(asc(quizzes.position), asc(quizzes.id));
          return {
            kind: "reordered",
            quizzes: rows.map(toTeacherQuizResponse),
          };
        });
      } catch (error) {
        if (isQuizPositionConflict(error)) return { kind: "conflict" };
        throw error;
      }
    },

    async listTopicQuizzes(
      courseId: string,
      topicId: string,
      teacherId: string,
    ): Promise<TeacherQuizResponse[]> {
      const rows = await selectQuiz(database)
        .where(
          and(
            eq(courses.id, courseId),
            eq(topics.id, topicId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .orderBy(asc(quizzes.position), asc(quizzes.id));

      return rows.map(toTeacherQuizResponse);
    },

    async getQuizById(
      courseId: string,
      topicId: string,
      quizId: string,
      teacherId: string,
    ): Promise<TeacherQuizResponse | null> {
      const [quiz] = await selectQuiz(database)
        .where(
          and(
            eq(courses.id, courseId),
            eq(topics.id, topicId),
            eq(quizzes.id, quizId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .limit(1);

      return quiz ? toTeacherQuizResponse(quiz) : null;
    },

    async updateQuiz(
      courseId: string,
      topicId: string,
      quizId: string,
      teacherId: string,
      data: UpdateTeacherQuizRequest,
    ): Promise<UpdateQuizResult> {
      return withTransaction(database, async (transaction) => {
        const access = await lockDraftCourse(transaction, courseId, teacherId);

        if (access !== "editable") {
          return { kind: access };
        }

        if (!(await topicBelongsToCourse(transaction, courseId, topicId))) {
          return { kind: "not_found" };
        }

        const [updated] = await transaction
          .update(quizzes)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(and(eq(quizzes.id, quizId), eq(quizzes.topicId, topicId)))
          .returning({ id: quizzes.id });

        if (!updated) {
          return { kind: "not_found" };
        }

        const [quiz] = await selectQuiz(transaction)
          .where(
            and(
              eq(courses.id, courseId),
              eq(courses.teacherId, teacherId),
              eq(topics.id, topicId),
              eq(quizzes.id, updated.id),
            ),
          )
          .limit(1);

        if (!quiz) {
          return { kind: "not_found" };
        }

        return {
          kind: "updated",
          quiz: toTeacherQuizResponse(quiz),
        };
      });
    },
  };
}
