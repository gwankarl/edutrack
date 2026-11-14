import { and, eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import {
  teacherApplications,
  type TeacherApplication,
} from "../../infrastructure/database/schema/teacher-applications.js";
import {
  teacherProfiles,
  type TeacherProfile,
} from "../../infrastructure/database/schema/teacher-profiles.js";
import { users } from "../../infrastructure/database/schema/users.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateTeacherProfileInput = Pick<
  typeof teacherProfiles.$inferInsert,
  "userId" | "displayName" | "biography" | "qualifications"
>;

export type TeacherApplicationDecisionUser = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "displayName"
>;

export interface ApprovePendingApplicationInput {
  applicationId: string;
  reviewedAt: Date;
  reviewedBy: string;
  reviewNotes?: string;
}

export interface RejectPendingApplicationInput {
  applicationId: string;
  reviewedAt: Date;
  reviewedBy: string;
  rejectionReason: string;
  reviewNotes?: string;
}

/**
 * Creates decision operations against a database or an active Drizzle
 * transaction. The service owns transaction boundaries and rollback behavior.
 */
export function createTeacherApplicationDecisionRepository(
  database: DatabaseExecutor,
) {
  return {
    /**
     * Locks a pending application row until the surrounding transaction ends.
     * Returns null if the application is missing or already decided.
     */
    async findPendingApplicationForUpdate(
      applicationId: string,
    ): Promise<TeacherApplication | null> {
      const [application] = await database
        .select()
        .from(teacherApplications)
        .where(
          and(
            eq(teacherApplications.id, applicationId),
            eq(teacherApplications.status, "pending"),
          ),
        )
        .limit(1)
        .for("update");

      return application ?? null;
    },

    /**
     * Updates only a still-pending application. A null result means another
     * transaction already decided it or it was not pending.
     */
    async approvePendingApplication(
      input: ApprovePendingApplicationInput,
    ): Promise<TeacherApplication | null> {
      const [application] = await database
        .update(teacherApplications)
        .set({
          status: "approved",
          reviewedAt: input.reviewedAt,
          reviewedBy: input.reviewedBy,
          rejectionReason: null,
          reviewNotes: input.reviewNotes ?? null,
        })
        .where(
          and(
            eq(teacherApplications.id, input.applicationId),
            eq(teacherApplications.status, "pending"),
          ),
        )
        .returning();

      return application ?? null;
    },

    /**
     * Updates only a still-pending application. The database check constraint
     * also enforces the required nonblank rejection reason and review metadata.
     */
    async rejectPendingApplication(
      input: RejectPendingApplicationInput,
    ): Promise<TeacherApplication | null> {
      const [application] = await database
        .update(teacherApplications)
        .set({
          status: "rejected",
          reviewedAt: input.reviewedAt,
          reviewedBy: input.reviewedBy,
          rejectionReason: input.rejectionReason,
          reviewNotes: input.reviewNotes ?? null,
        })
        .where(
          and(
            eq(teacherApplications.id, input.applicationId),
            eq(teacherApplications.status, "pending"),
          ),
        )
        .returning();

      return application ?? null;
    },

    /**
     * Returns null when this user already has a teacher profile. Other
     * database errors, such as a missing user foreign key, are propagated.
     */
    async createTeacherProfile(
      input: CreateTeacherProfileInput,
    ): Promise<TeacherProfile | null> {
      const [profile] = await database
        .insert(teacherProfiles)
        .values(input)
        .onConflictDoNothing({ target: teacherProfiles.userId })
        .returning();

      return profile ?? null;
    },

    /**
     * Adds the Teacher role without deleting any existing roles. Returns null
     * when the role assignment already exists.
     */
    async grantTeacherRole(userId: string): Promise<"teacher" | null> {
      const [assignment] = await database
        .insert(roleAssignments)
        .values({
          userId,
          role: "teacher",
        })
        .onConflictDoNothing({
          target: [roleAssignments.userId, roleAssignments.role],
        })
        .returning({ role: roleAssignments.role });

      return assignment ? "teacher" : null;
    },

    async findApplicationForUpdate(
      applicationId: string,
    ): Promise<TeacherApplication | null> {
      const [application] = await database
        .select()
        .from(teacherApplications)
        .where(eq(teacherApplications.id, applicationId))
        .limit(1)
        .for("update");

      return application ?? null;
    },

    async findUserById(
      userId: string,
    ): Promise<TeacherApplicationDecisionUser | null> {
      const [user] = await database
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user ?? null;
    },
  };
}
