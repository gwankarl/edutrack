import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { topics } from "./topics.js";

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>(),
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
    uniqueIndex("lessons_topic_position_unique").on(
      table.topicId,
      table.position,
    ),
    check("lessons_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check("lessons_position_positive", sql`${table.position} > 0`),
    check(
      "lessons_content_object_check",
      sql`${table.content} IS NULL OR jsonb_typeof(${table.content}) = 'object'`,
    ),
  ],
);

export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
