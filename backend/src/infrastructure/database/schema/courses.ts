import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { academicLevels } from "./academic-levels.js";
import { subjects } from "./subjects.js";
import { teacherProfiles } from "./teacher-profiles.js";

export const courseStatus = pgEnum("course_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
]);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    academicLevelId: uuid("academic_level_id")
      .notNull()
      .references(() => academicLevels.id, { onDelete: "restrict" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teacherProfiles.id, { onDelete: "restrict" }),
    status: courseStatus("status").notNull().default("draft"),
    thumbnailPublicId: varchar("thumbnail_public_id", { length: 255 }),
    thumbnailAssetId: varchar("thumbnail_asset_id", { length: 255 }),
    thumbnailSecureUrl: text("thumbnail_secure_url"),
    thumbnailWidth: integer("thumbnail_width"),
    thumbnailHeight: integer("thumbnail_height"),
    thumbnailFormat: varchar("thumbnail_format", { length: 8 }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("courses_academic_level_subject_idx").on(
      table.academicLevelId,
      table.subjectId,
    ),
    index("courses_subject_id_idx").on(table.subjectId),
    index("courses_teacher_id_idx").on(table.teacherId),
    index("courses_status_created_at_idx").on(table.status, table.createdAt),
    uniqueIndex("courses_thumbnail_public_id_unique")
      .on(table.thumbnailPublicId)
      .where(sql`${table.thumbnailPublicId} IS NOT NULL`),
    uniqueIndex("courses_thumbnail_asset_id_unique")
      .on(table.thumbnailAssetId)
      .where(sql`${table.thumbnailAssetId} IS NOT NULL`),
    check("courses_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "courses_description_not_blank",
      sql`${table.description} IS NULL OR length(btrim(${table.description})) > 0`,
    ),
    check(
      "courses_thumbnail_metadata_complete",
      sql`(${table.thumbnailPublicId} IS NULL AND ${table.thumbnailAssetId} IS NULL AND ${table.thumbnailSecureUrl} IS NULL AND ${table.thumbnailWidth} IS NULL AND ${table.thumbnailHeight} IS NULL AND ${table.thumbnailFormat} IS NULL) OR (${table.thumbnailPublicId} IS NOT NULL AND ${table.thumbnailAssetId} IS NOT NULL AND ${table.thumbnailSecureUrl} IS NOT NULL AND ${table.thumbnailWidth} IS NOT NULL AND ${table.thumbnailHeight} IS NOT NULL AND ${table.thumbnailFormat} IS NOT NULL)`,
    ),
    check(
      "courses_thumbnail_secure_url_check",
      sql`${table.thumbnailSecureUrl} IS NULL OR ${table.thumbnailSecureUrl} LIKE 'https://%'`,
    ),
    check(
      "courses_thumbnail_dimensions_positive",
      sql`(${table.thumbnailWidth} IS NULL AND ${table.thumbnailHeight} IS NULL) OR (${table.thumbnailWidth} > 0 AND ${table.thumbnailHeight} > 0)`,
    ),
    check(
      "courses_thumbnail_format_check",
      sql`${table.thumbnailFormat} IS NULL OR ${table.thumbnailFormat} IN ('jpg', 'png', 'webp')`,
    ),
  ],
);

export type CourseStatus = (typeof courseStatus.enumValues)[number];

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
