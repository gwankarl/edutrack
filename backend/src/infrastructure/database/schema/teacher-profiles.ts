import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const teacherProfiles = pgTable(
  "teacher_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    biography: text("biography"),
    qualifications: text("qualifications"),
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
    uniqueIndex("teacher_profiles_user_id_unique").on(table.userId),
    check(
      "teacher_profiles_display_name_not_blank",
      sql`length(btrim(${table.displayName})) > 0`,
    ),
    check(
      "teacher_profiles_biography_not_blank",
      sql`${table.biography} IS NULL OR length(btrim(${table.biography})) > 0`,
    ),
    check(
      "teacher_profiles_qualifications_not_blank",
      sql`${table.qualifications} IS NULL OR length(btrim(${table.qualifications})) > 0`,
    ),
  ],
);

export type TeacherProfile = typeof teacherProfiles.$inferSelect;
export type NewTeacherProfile = typeof teacherProfiles.$inferInsert;
