import { and, asc, eq, max } from "drizzle-orm";

import type {
  CreateTeacherTopicRequest,
  TeacherTopicResponse,
  UpdateTeacherTopicRequest,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { courses } from "../../infrastructure/database/schema/courses.js";
import { topics } from "../../infrastructure/database/schema/topics.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateTopicResult =
  | { kind: "created"; topic: TeacherTopicResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "conflict" };

export type UpdateTopicResult =
  | { kind: "updated"; topic: TeacherTopicResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" };

export type ReorderTopicsResult =
  | { kind: "reordered"; topics: TeacherTopicResponse[] }
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "invalid_order" }
  | { kind: "conflict" };

function selectTopic(database: DatabaseExecutor) {
  return database
    .select({
      id: topics.id,
      courseId: topics.courseId,
      title: topics.title,
      description: topics.description,
      position: topics.position,
      createdAt: topics.createdAt,
      updatedAt: topics.updatedAt,
    })
    .from(topics)
    .innerJoin(courses, eq(topics.courseId, courses.id));
}

type TopicRow = Awaited<ReturnType<typeof selectTopic>>[number];

function toTeacherTopicResponse(row: TopicRow): TeacherTopicResponse {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isTopicPositionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };

  if (
    candidate.code === "23505" &&
    candidate.constraint === "topics_course_position_unique"
  ) {
    return true;
  }

  return candidate.cause !== error && isTopicPositionConflict(candidate.cause);
}

function withTransaction<T>(
  database: DatabaseExecutor,
  operation: (transaction: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  if ("transaction" in database) {
    return database.transaction((transaction) => operation(transaction));
  }

  // A transaction supplied by the caller is reused; do not nest one.
  return operation(database);
}

/**
 * Locks the teacher-owned parent course while a topic mutation is in flight.
 * A non-owned course is reported as not_found to avoid disclosing its existence.
 */
async function lockEditableCourse(
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

/**
 * Creates topic operations against a database or an active transaction.
 * Mutations lock the parent course so position allocation and Draft checks
 * remain safe against concurrent requests and course status changes.
 */
export function createTopicRepository(database: DatabaseExecutor) {
  return {
    async createTopic(
      courseId: string,
      teacherId: string,
      data: CreateTeacherTopicRequest,
    ): Promise<CreateTopicResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockEditableCourse(
            transaction,
            courseId,
            teacherId,
          );

          if (access !== "editable") {
            return { kind: access };
          }

          const [positionResult] = await transaction
            .select({ maxPosition: max(topics.position) })
            .from(topics)
            .where(eq(topics.courseId, courseId));

          const position = (positionResult?.maxPosition ?? 0) + 1;

          const [created] = await transaction
            .insert(topics)
            .values({
              courseId,
              title: data.title,
              description: data.description,
              position,
            })
            .returning({ id: topics.id });

          if (!created) {
            throw new Error("Topic insert did not return a row.");
          }

          const [topic] = await selectTopic(transaction)
            .where(
              and(
                eq(topics.id, created.id),
                eq(topics.courseId, courseId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .limit(1);

          if (!topic) {
            throw new Error("Created topic could not be retrieved.");
          }

          return {
            kind: "created",
            topic: toTeacherTopicResponse(topic),
          };
        });
      } catch (error) {
        if (isTopicPositionConflict(error)) {
          return { kind: "conflict" };
        }

        throw error;
      }
    },

    async listCourseTopics(
      courseId: string,
      teacherId: string,
    ): Promise<TeacherTopicResponse[]> {
      const rows = await selectTopic(database)
        .where(
          and(eq(topics.courseId, courseId), eq(courses.teacherId, teacherId)),
        )
        .orderBy(asc(topics.position), asc(topics.id));

      return rows.map(toTeacherTopicResponse);
    },

    async getTopicById(
      courseId: string,
      topicId: string,
      teacherId: string,
    ): Promise<TeacherTopicResponse | null> {
      const [topic] = await selectTopic(database)
        .where(
          and(
            eq(topics.courseId, courseId),
            eq(topics.id, topicId),
            eq(courses.teacherId, teacherId),
          ),
        )
        .limit(1);

      return topic ? toTeacherTopicResponse(topic) : null;
    },

    async updateTopic(
      courseId: string,
      topicId: string,
      teacherId: string,
      data: UpdateTeacherTopicRequest,
    ): Promise<UpdateTopicResult> {
      return withTransaction(database, async (transaction) => {
        const access = await lockEditableCourse(
          transaction,
          courseId,
          teacherId,
        );

        if (access !== "editable") {
          return { kind: access };
        }

        const [updated] = await transaction
          .update(topics)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(and(eq(topics.id, topicId), eq(topics.courseId, courseId)))
          .returning({ id: topics.id });

        if (!updated) {
          return { kind: "not_found" };
        }

        const [topic] = await selectTopic(transaction)
          .where(
            and(
              eq(topics.id, updated.id),
              eq(topics.courseId, courseId),
              eq(courses.teacherId, teacherId),
            ),
          )
          .limit(1);

        if (!topic) {
          return { kind: "not_found" };
        }

        return {
          kind: "updated",
          topic: toTeacherTopicResponse(topic),
        };
      });
    },

    async reorderCourseTopics(
      courseId: string,
      teacherId: string,
      topicIds: string[],
    ): Promise<ReorderTopicsResult> {
      try {
        return await withTransaction(database, async (transaction) => {
          const access = await lockEditableCourse(
            transaction,
            courseId,
            teacherId,
          );

          if (access !== "editable") {
            return { kind: access };
          }

          const current = await transaction
            .select({ id: topics.id, position: topics.position })
            .from(topics)
            .where(eq(topics.courseId, courseId))
            .orderBy(asc(topics.position), asc(topics.id));
          const existingIds = new Set(current.map(({ id }) => id));
          const requestedIds = new Set(topicIds);

          if (
            requestedIds.size !== topicIds.length ||
            topicIds.length !== current.length ||
            topicIds.some((id) => !existingIds.has(id))
          ) {
            return { kind: "invalid_order" };
          }

          const maxPosition = current.reduce(
            (maximum, topic) => Math.max(maximum, topic.position),
            0,
          );
          if (maxPosition + current.length > 2_147_483_647) {
            return { kind: "conflict" };
          }

          const updatedAt = new Date();

          // Move every row into unused positive positions before assigning
          // the requested positions; this is safe with the immediate unique index.
          for (const [index, topic] of current.entries()) {
            await transaction
              .update(topics)
              .set({ position: maxPosition + index + 1, updatedAt })
              .where(
                and(eq(topics.id, topic.id), eq(topics.courseId, courseId)),
              );
          }

          for (const [index, topicId] of topicIds.entries()) {
            await transaction
              .update(topics)
              .set({ position: index + 1, updatedAt })
              .where(
                and(eq(topics.id, topicId), eq(topics.courseId, courseId)),
              );
          }

          const rows = await selectTopic(transaction)
            .where(
              and(
                eq(topics.courseId, courseId),
                eq(courses.teacherId, teacherId),
              ),
            )
            .orderBy(asc(topics.position), asc(topics.id));

          return {
            kind: "reordered",
            topics: rows.map(toTeacherTopicResponse),
          };
        });
      } catch (error) {
        if (isTopicPositionConflict(error)) {
          return { kind: "conflict" };
        }

        throw error;
      }
    },
  };
}
