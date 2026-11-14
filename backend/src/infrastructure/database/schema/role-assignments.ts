import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

export const roleAssignmentRole = pgEnum("role_assignment_role", [
  "student",
  "teacher",
  "administrator",
]);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleAssignmentRole("role").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("role_assignments_user_role_unique").on(
      table.userId,
      table.role,
    ),
    index("role_assignments_role_idx").on(table.role),
  ],
);
