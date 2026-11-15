import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  integer,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";

import { courses } from "./courses.js";

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    position: integer("position").notNull(),
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
    uniqueIndex("topics_course_position_unique").on(
      table.courseId,
      table.position,
    ),
    check("topics_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "topics_description_not_blank",
      sql`${table.description} IS NULL OR length(btrim(${table.description})) > 0`,
    ),
    check("topics_position_positive", sql`${table.position} > 0`),
  ],
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
