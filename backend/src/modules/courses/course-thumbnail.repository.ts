import { and, asc, eq, lte, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { courseThumbnailCleanup } from "../../infrastructure/database/schema/course-thumbnail-cleanup.js";
import { courses } from "../../infrastructure/database/schema/courses.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
type DatabaseExecutor = Database | DatabaseTransaction;

export interface CourseThumbnailMetadata {
  publicId: string;
  assetId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: "jpg" | "png" | "webp";
}

export type ThumbnailMutationResult =
  { kind: "updated" } | { kind: "not_found" } | { kind: "not_editable" };

async function recordCleanup(
  executor: DatabaseExecutor,
  asset: Pick<CourseThumbnailMetadata, "publicId" | "assetId">,
): Promise<void> {
  await executor
    .insert(courseThumbnailCleanup)
    .values(asset)
    .onConflictDoNothing({ target: courseThumbnailCleanup.assetId });
}

export function createCourseThumbnailRepository(database: Database) {
  async function mutateThumbnail(
    courseId: string,
    teacherId: string,
    next: CourseThumbnailMetadata | null,
  ): Promise<ThumbnailMutationResult> {
    return database.transaction(async (transaction) => {
      const [course] = await transaction
        .select({
          status: courses.status,
          publicId: courses.thumbnailPublicId,
          assetId: courses.thumbnailAssetId,
        })
        .from(courses)
        .where(and(eq(courses.id, courseId), eq(courses.teacherId, teacherId)))
        .for("update")
        .limit(1);

      if (!course) {
        return { kind: "not_found" };
      }

      if (course.status !== "draft") {
        return { kind: "not_editable" };
      }

      const [updated] = await transaction
        .update(courses)
        .set({
          thumbnailPublicId: next?.publicId ?? null,
          thumbnailAssetId: next?.assetId ?? null,
          thumbnailSecureUrl: next?.secureUrl ?? null,
          thumbnailWidth: next?.width ?? null,
          thumbnailHeight: next?.height ?? null,
          thumbnailFormat: next?.format ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(courses.id, courseId),
            eq(courses.teacherId, teacherId),
            eq(courses.status, "draft"),
          ),
        )
        .returning({ id: courses.id });

      if (!updated) {
        return { kind: "not_editable" };
      }

      if (course.publicId && course.assetId) {
        await recordCleanup(transaction, {
          publicId: course.publicId,
          assetId: course.assetId,
        });
      }

      return { kind: "updated" };
    });
  }

  return {
    replaceThumbnail: mutateThumbnail,
    removeThumbnail: (courseId: string, teacherId: string) =>
      mutateThumbnail(courseId, teacherId, null),

    async queueCleanup(
      asset: Pick<CourseThumbnailMetadata, "publicId" | "assetId">,
    ): Promise<void> {
      await recordCleanup(database, asset);
    },

    async listPendingCleanup(limit = 25) {
      return database
        .select()
        .from(courseThumbnailCleanup)
        .where(lte(courseThumbnailCleanup.nextAttemptAt, new Date()))
        .orderBy(
          asc(courseThumbnailCleanup.nextAttemptAt),
          asc(courseThumbnailCleanup.id),
        )
        .limit(limit);
    },

    async completeCleanup(id: string): Promise<void> {
      await database
        .delete(courseThumbnailCleanup)
        .where(eq(courseThumbnailCleanup.id, id));
    },

    async retryCleanup(id: string, delayMilliseconds: number): Promise<void> {
      await database
        .update(courseThumbnailCleanup)
        .set({
          attemptCount: sql`${courseThumbnailCleanup.attemptCount} + 1`,
          nextAttemptAt: new Date(Date.now() + delayMilliseconds),
        })
        .where(eq(courseThumbnailCleanup.id, id));
    },
  };
}
