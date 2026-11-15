import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const academicLevelStage = pgEnum("academic_level_stage", [
  "lower_secondary",
  "upper_secondary",
]);

export const academicLevels = pgTable(
  "academic_levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    stage: academicLevelStage("stage").notNull(),
    sortOrder: smallint("sort_order").notNull(),
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
    uniqueIndex("academic_levels_code_unique").on(table.code),
    uniqueIndex("academic_levels_sort_order_unique").on(table.sortOrder),
    index("academic_levels_stage_idx").on(table.stage),
    check(
      "academic_levels_code_check",
      sql`${table.code} = lower(${table.code}) AND length(btrim(${table.code})) > 0`,
    ),
    check(
      "academic_levels_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check("academic_levels_sort_order_positive", sql`${table.sortOrder} > 0`),
  ],
);

export type AcademicLevelStage = (typeof academicLevelStage.enumValues)[number];

export type AcademicLevel = typeof academicLevels.$inferSelect;
export type NewAcademicLevel = typeof academicLevels.$inferInsert;
