import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { teacherApplications } from "../../infrastructure/database/schema/teacher-applications.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type TeacherApplicationRecord = typeof teacherApplications.$inferSelect;

export type CreateTeacherApplicationInput = Pick<
  typeof teacherApplications.$inferInsert,
  "userId" | "motivation" | "qualifications"
>;

export class PendingTeacherApplicationExistsError extends Error {
  constructor() {
    super("A pending teacher application already exists.");
    this.name = "PendingTeacherApplicationExistsError";
  }
}

function isPendingApplicationUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const details = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      details.code === "23505" &&
      details.constraint === "teacher_applications_one_pending_per_user_unique"
    ) {
      return true;
    }

    current = details.cause;
  }

  return false;
}

/**
 * Creates repository operations against a database or an active Drizzle
 * transaction. Callers own transaction boundaries and business decisions.
 */
export function createTeacherApplicationRepository(database: DatabaseExecutor) {
  return {
    async createApplication(
      input: CreateTeacherApplicationInput,
    ): Promise<TeacherApplicationRecord> {
      try {
        const [application] = await database
          .insert(teacherApplications)
          .values(input)
          .returning();

        if (!application) {
          throw new Error("Teacher application insert did not return a row.");
        }

        return application;
      } catch (error) {
        if (isPendingApplicationUniqueViolation(error)) {
          throw new PendingTeacherApplicationExistsError();
        }

        throw error;
      }
    },

    async findLatestByUserId(
      userId: string,
    ): Promise<TeacherApplicationRecord | null> {
      const [application] = await database
        .select()
        .from(teacherApplications)
        .where(eq(teacherApplications.userId, userId))
        .orderBy(
          desc(teacherApplications.submittedAt),
          desc(teacherApplications.id),
        )
        .limit(1);

      return application ?? null;
    },

    async hasPendingApplication(userId: string): Promise<boolean> {
      const [application] = await database
        .select({ id: teacherApplications.id })
        .from(teacherApplications)
        .where(
          and(
            eq(teacherApplications.userId, userId),
            eq(teacherApplications.status, "pending"),
          ),
        )
        .limit(1);

      return application !== undefined;
    },

    async findById(
      applicationId: string,
    ): Promise<TeacherApplicationRecord | null> {
      const [application] = await database
        .select()
        .from(teacherApplications)
        .where(eq(teacherApplications.id, applicationId))
        .limit(1);

      return application ?? null;
    },
  };
}
