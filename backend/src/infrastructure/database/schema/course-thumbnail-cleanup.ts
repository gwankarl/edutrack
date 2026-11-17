import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Durable cleanup queue for Cloudinary assets removed from a course. */
export const courseThumbnailCleanup = pgTable(
  "course_thumbnail_cleanup",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: varchar("public_id", { length: 255 }).notNull(),
    assetId: varchar("asset_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("course_thumbnail_cleanup_asset_id_unique").on(table.assetId),
    index("course_thumbnail_cleanup_next_attempt_idx").on(table.nextAttemptAt),
    check(
      "course_thumbnail_cleanup_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export type CourseThumbnailCleanup = typeof courseThumbnailCleanup.$inferSelect;
