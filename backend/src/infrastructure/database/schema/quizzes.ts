import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { topics } from "./topics.js";

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
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
    uniqueIndex("quizzes_topic_position_unique").on(
      table.topicId,
      table.position,
    ),
    check("quizzes_title_not_blank", sql`length(btrim(${table.title})) > 0`),
    check(
      "quizzes_description_not_blank",
      sql`${table.description} IS NULL OR length(btrim(${table.description})) > 0`,
    ),
    check("quizzes_position_positive", sql`${table.position} > 0`),
  ],
);

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
