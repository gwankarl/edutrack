import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
    check("courses_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "courses_description_not_blank",
      sql`${table.description} IS NULL OR length(btrim(${table.description})) > 0`,
    ),
  ],
);

export type CourseStatus = (typeof courseStatus.enumValues)[number];

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
