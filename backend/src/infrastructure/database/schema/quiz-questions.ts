import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  text,
} from "drizzle-orm/pg-core";

import { quizzes } from "./quizzes.js";

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
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
    uniqueIndex("quiz_questions_quiz_position_unique").on(
      table.quizId,
      table.position,
    ),
    check(
      "quiz_questions_question_text_not_blank",
      sql`length(btrim(${table.questionText})) > 0`,
    ),
    check("quiz_questions_position_positive", sql`${table.position} > 0`),
  ],
);

export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
