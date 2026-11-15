import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
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
    uniqueIndex("subjects_code_unique").on(table.code),
    index("subjects_sort_order_idx").on(table.sortOrder, table.code),
    check(
      "subjects_code_check",
      sql`${table.code} = lower(${table.code}) AND length(btrim(${table.code})) > 0`,
    ),
    check("subjects_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check("subjects_sort_order_positive", sql`${table.sortOrder} > 0`),
  ],
);

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
