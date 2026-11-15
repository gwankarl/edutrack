import { and, asc, eq, max } from "drizzle-orm";

import type {
  CreateTeacherLessonRequest,
  TeacherLessonResponse,
  UpdateTeacherLessonRequest,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { courses } from "../../infrastructure/database/schema/courses.js";
import { lessons } from "../../infrastructure/database/schema/lessons.js";
import { topics } from "../../infrastructure/database/schema/topics.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateLessonResult =
  | { kind: "created"; lesson: TeacherLessonResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict" };

export type UpdateLessonResult =
  | { kind: "updated"; lesson: TeacherLessonResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" };

export type ReorderLessonsResult =
  | { kind: "reordered"; lessons: TeacherLessonResponse[] }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "invalid_order" }
  | { kind: "conflict" };

function selectLesson(database: DatabaseExecutor) {
  return database
    .select({
      id: lessons.id,
      topicId: lessons.topicId,
      title: lessons.title,
      content: lessons.content,
      position: lessons.position,
      createdAt: lessons.createdAt,
      updatedAt: lessons.updatedAt,
    })
    .from(lessons)
    .innerJoin(topics, eq(lessons.topicId, topics.id))
    .innerJoin(courses, eq(topics.courseId, courses.id));
}

type LessonRow = Awaited<ReturnType<typeof selectLesson>>[number];

function toTeacherLessonResponse(row: LessonRow): TeacherLessonResponse {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isLessonPositionConflict(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "lessons_topic_position_unique"
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

function withTransaction<T>(
  database: DatabaseExecutor,
  operation: (transaction: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  if ("transaction" in database) {
    return database.transaction((transaction) => operation(transaction));
  }

  // Reuse a transaction supplied by the caller instead of nesting one.
  return operation(database);
}

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
 * Lesson operations are scoped through topic and course ownership.
 * Mutations lock the parent course inside a transaction, serializing lesson
 * position allocation and preventing a concurrent Draft-to-review transition
 * from racing with a lesson write.
 */
export function createLessonRepository(database: DatabaseExecutor) {
  return {
    async createLesson(
      courseId: string,
      topicId: string,
      teacherId: string,
      data: CreateTeacherLessonRequest,
    ): Promise<CreateLessonResult> {
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
            .select({ maxPosition: max(lessons.position) })
            .from(lessons)
            .where(eq(lessons.topicId, topicId));

          const position = (positionResult?.maxPosition ?? 0) + 1;

          const [created] = await transaction
            .insert(lessons)
            .values({
              topicId,
              title: data.title,
              content: data.content ?? null,
              position,
            })
            .returning({ id: lessons.id });

          if (!created) {
            throw new Error("Lesson insert did not return a row.");
          }

          const [lesson] = await selectLesson(transaction)
            .where(
              and(
                eq(lessons.id, created.id),
                eq(lessons.topicId, topicId),
                eq(topics.courseId, courseId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);

          if (!lesson) {
            throw new Error("Created lesson could not be retrieved.");
          }

          return {
            kind: "created",
            lesson: toTeacherLessonResponse(lesson),
          };
        });
      } catch (error) {
        if (isLessonPositionConflict(error)) {
          return { kind: "conflict" };
        }

        throw error;
      }
    },

    async listTopicLessons(
      courseId: string,
      topicId: string,
      teacherId: string,
    ): Promise<TeacherLessonResponse[]> {
      const rows = await selectLesson(database)
        .where(
          and(
            eq(topics.courseId, courseId),
            eq(topics.id, topicId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .orderBy(asc(lessons.position), asc(lessons.id));

      return rows.map(toTeacherLessonResponse);
    },

    async getLessonById(
      courseId: string,
      topicId: string,
      lessonId: string,
      teacherId: string,
    ): Promise<TeacherLessonResponse | null> {
      const [lesson] = await selectLesson(database)
        .where(
          and(
            eq(courses.id, courseId),
            eq(topics.id, topicId),
            eq(lessons.id, lessonId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .limit(1);

      return lesson ? toTeacherLessonResponse(lesson) : null;
    },

    async updateLesson(
      courseId: string,
      topicId: string,
      lessonId: string,
      teacherId: string,
      data: UpdateTeacherLessonRequest,
    ): Promise<UpdateLessonResult> {
      return withTransaction(database, async (transaction) => {
        const access = await lockDraftCourse(transaction, courseId, teacherId);

        if (access !== "editable") {
          return { kind: access };
        }

        if (!(await topicBelongsToCourse(transaction, courseId, topicId))) {
          return { kind: "not_found" };
        }

        const [updated] = await transaction
          .update(lessons)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(and(eq(lessons.id, lessonId), eq(lessons.topicId, topicId)))
          .returning({ id: lessons.id });

        if (!updated) {
          return { kind: "not_found" };
        }

        const [lesson] = await selectLesson(transaction)
          .where(
            and(
              eq(courses.id, courseId),
              eq(courses.teacherId, teacherId),
              eq(topics.id, topicId),
              eq(lessons.id, updated.id),
            ),
          )
          .limit(1);

        if (!lesson) {
          return { kind: "not_found" };
        }

        return {
          kind: "updated",
          lesson: toTeacherLessonResponse(lesson),
        };
      });
    },

    async reorderTopicLessons(
      courseId: string,
      topicId: string,
      teacherId: string,
      lessonIds: string[],
    ): Promise<ReorderLessonsResult> {
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

          const current = await transaction
            .select({ id: lessons.id, position: lessons.position })
            .from(lessons)
            .where(eq(lessons.topicId, topicId))
            .orderBy(asc(lessons.position), asc(lessons.id));
          const existingIds = new Set(current.map(({ id }) => id));
          const requestedIds = new Set(lessonIds);

          if (
            requestedIds.size !== lessonIds.length ||
            lessonIds.length !== current.length ||
            lessonIds.some((id) => !existingIds.has(id))
          ) {
            return { kind: "invalid_order" };
          }

          const maxPosition = current.reduce(
            (maximum, lesson) => Math.max(maximum, lesson.position),
            0,
          );
          if (maxPosition + current.length > 2_147_483_647) {
            return { kind: "conflict" };
          }

          const updatedAt = new Date();

          // Stage into unused positive positions before assigning the final
          // sequence; the unique index is immediate, not deferrable.
          for (const [index, lesson] of current.entries()) {
            await transaction
              .update(lessons)
              .set({ position: maxPosition + index + 1, updatedAt })
              .where(
                and(eq(lessons.id, lesson.id), eq(lessons.topicId, topicId)),
              );
          }

          for (const [index, lessonId] of lessonIds.entries()) {
            await transaction
              .update(lessons)
              .set({ position: index + 1, updatedAt })
              .where(
                and(eq(lessons.id, lessonId), eq(lessons.topicId, topicId)),
              );
          }

          const rows = await selectLesson(transaction)
            .where(
              and(
                eq(courses.id, courseId),
                eq(courses.teacherId, teacherId),
                eq(topics.id, topicId),
              ),
            )
            .orderBy(asc(lessons.position), asc(lessons.id));

          return {
            kind: "reordered",
            lessons: rows.map(toTeacherLessonResponse),
          };
        });
      } catch (error) {
        if (isLessonPositionConflict(error)) {
          return { kind: "conflict" };
        }

        throw error;
      }
    },
  };
}
