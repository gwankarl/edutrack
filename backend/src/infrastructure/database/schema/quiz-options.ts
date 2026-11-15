import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  text,
} from "drizzle-orm/pg-core";

import { quizQuestions } from "./quiz-questions.js";

export const quizOptions = pgTable(
  "quiz_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    optionText: text("option_text").notNull(),
    position: integer("position").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => [
    uniqueIndex("quiz_options_question_position_unique").on(
      table.questionId,
      table.position,
    ),
    uniqueIndex("quiz_options_one_correct_per_question_unique")
      .on(table.questionId)
      .where(sql`${table.isCorrect} = true`),
    check(
      "quiz_options_option_text_not_blank",
      sql`length(btrim(${table.optionText})) > 0`,
    ),
    check("quiz_options_position_positive", sql`${table.position} > 0`),
  ],
);

export type QuizOption = typeof quizOptions.$inferSelect;
export type NewQuizOption = typeof quizOptions.$inferInsert;
