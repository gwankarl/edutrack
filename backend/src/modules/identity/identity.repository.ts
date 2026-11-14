import { eq, sql } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import { users } from "../../infrastructure/database/schema/users.js";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";

const userSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
};

const authenticatedUserSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  accountStatus: users.accountStatus,
};

const loginUserSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  passwordHash: users.passwordHash,
  accountStatus: users.accountStatus,
  emailVerifiedAt: users.emailVerifiedAt,
};

const currentUserSelection = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  emailVerifiedAt: users.emailVerifiedAt,
  accountStatus: users.accountStatus,
};

export type IdentityLoginUser = Pick<
  typeof users.$inferSelect,
  | "id"
  | "email"
  | "displayName"
  | "passwordHash"
  | "accountStatus"
  | "emailVerifiedAt"
>;

export type IdentityUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "displayName"
>;

export type IdentityCurrentUserRecord = IdentityUser & {
  emailVerifiedAt: Date | null;
  accountStatus: string;
};

export type CreateIdentityUserInput = Pick<
  IdentityUser,
  "email" | "displayName"
> & {
  passwordHash: string;
};

export class DuplicateEmailError extends Error {
  constructor() {
    super("Registration could not be completed.");
    this.name = "DuplicateEmailError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isEmailUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const details = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      details.code === "23505" &&
      details.constraint === "users_email_lower_unique"
    ) {
      return true;
    }

    current = details.cause;
  }

  return false;
}

export function createIdentityRepository(database: Database) {
  return {
    async findUserByEmail(email: string): Promise<IdentityUser | null> {
      const normalizedEmail = normalizeEmail(email);
      const [user] = await database
        .select(userSelection)
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);

      return user ?? null;
    },

    async createUser(input: CreateIdentityUserInput): Promise<IdentityUser> {
      try {
        return await database.transaction(async (transaction) => {
          const [user] = await transaction
            .insert(users)
            .values({
              email: normalizeEmail(input.email),
              displayName: input.displayName,
              passwordHash: input.passwordHash,
            })
            .returning(userSelection);

          if (!user) {
            throw new Error("User insert did not return a row.");
          }

          await transaction.insert(roleAssignments).values({
            userId: user.id,
            role: "student",
          });

          return user;
        });
      } catch (error) {
        if (isEmailUniqueViolation(error)) {
          throw new DuplicateEmailError();
        }

        throw error;
      }
    },

    async findUserForLogin(email: string): Promise<IdentityLoginUser | null> {
      const normalizedEmail = normalizeEmail(email);
      const [user] = await database
        .select(loginUserSelection)
        .from(users)
        .where(sql`lower(${users.email}) = ${normalizedEmail}`)
        .limit(1);

      return user ?? null;
    },

    async findUserById(
      userId: string,
    ): Promise<(IdentityUser & { accountStatus: string }) | null> {
      const [user] = await database
        .select(authenticatedUserSelection)
        .from(users)
        .where(sql`${users.id} = ${userId}`)
        .limit(1);

      return user ?? null;
    },

    async findRolesByUserId(userId: string): Promise<UserRole[]> {
      const assignments = await database
        .select({ role: roleAssignments.role })
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, userId));

      return assignments.map(({ role }) => role);
    },

    async findCurrentUserById(
      userId: string,
    ): Promise<IdentityCurrentUserRecord | null> {
      const [user] = await database
        .select(currentUserSelection)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user ?? null;
    },
  };
}
