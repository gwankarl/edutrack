import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    accountStatus: varchar("account_status", { length: 32 })
      .notNull()
      .default("active"),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    index("users_account_status_idx").on(table.accountStatus),
    check("users_email_not_blank", sql`length(btrim(${table.email})) > 0`),
    check(
      "users_display_name_not_blank",
      sql`length(btrim(${table.displayName})) > 0`,
    ),
    check(
      "users_account_status_not_blank",
      sql`length(btrim(${table.accountStatus})) > 0`,
    ),
  ],
);
