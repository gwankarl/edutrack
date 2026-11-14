import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const verificationTokenPurpose = pgEnum("verification_token_purpose", [
  "email_verification",
  "password_reset",
]);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: verificationTokenPurpose("purpose").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    consumedAt: timestamp("consumed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("verification_tokens_token_hash_unique").on(table.tokenHash),
    index("verification_tokens_user_id_idx").on(table.userId),
    index("verification_tokens_purpose_idx").on(table.purpose),
    index("verification_tokens_expires_at_idx").on(table.expiresAt),
  ],
);
