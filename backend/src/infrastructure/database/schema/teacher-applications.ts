import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const teacherApplicationStatus = pgEnum("teacher_application_status", [
  "pending",
  "approved",
  "rejected",
]);

export const teacherApplications = pgTable(
  "teacher_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: teacherApplicationStatus("status").notNull().default("pending"),
    motivation: text("motivation").notNull(),
    qualifications: text("qualifications").notNull(),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      mode: "date",
    }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    reviewNotes: text("review_notes"),
  },
  (table) => [
    index("teacher_applications_user_id_idx").on(table.userId),
    index("teacher_applications_status_submitted_at_idx").on(
      table.status,
      table.submittedAt,
    ),
    uniqueIndex("teacher_applications_one_pending_per_user_unique")
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
    check(
      "teacher_applications_motivation_not_blank",
      sql`length(btrim(${table.motivation})) > 0`,
    ),
    check(
      "teacher_applications_qualifications_not_blank",
      sql`length(btrim(${table.qualifications})) > 0`,
    ),
    check(
      "teacher_applications_review_state_check",
      sql`(
        ${table.status} = 'pending'
        AND ${table.reviewedAt} IS NULL
        AND ${table.reviewedBy} IS NULL
        AND ${table.reviewNotes} IS NULL
      ) OR (
        ${table.status} = 'approved'
        AND ${table.reviewedAt} IS NOT NULL
        AND ${table.reviewedBy} IS NOT NULL
      ) OR (
        ${table.status} = 'rejected'
        AND ${table.reviewedAt} IS NOT NULL
        AND ${table.reviewedBy} IS NOT NULL
        AND ${table.reviewNotes} IS NOT NULL
        AND length(btrim(${table.reviewNotes})) > 0
      )`,
    ),
  ],
);

export type TeacherApplicationStatus =
  (typeof teacherApplicationStatus.enumValues)[number];

export type TeacherApplication = typeof teacherApplications.$inferSelect;

export type NewTeacherApplication = typeof teacherApplications.$inferInsert;
