import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { roleAssignments } from "../../infrastructure/database/schema/role-assignments.js";
import { teacherProfiles } from "../../infrastructure/database/schema/teacher-profiles.js";
import { createTeacherApplicationRepository } from "./teacher-application.repository.js";
import { createTeacherApplicationDecisionRepository } from "./teacher-application-decision.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const applicationRepository = createTeacherApplicationRepository(database);
const createdUserIds: string[] = [];

async function createTestUser(displayName: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `decision-repository-${randomUUID()}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      displayName,
    ],
  );

  const userId = result.rows[0]?.id;

  if (!userId) {
    throw new Error("Test user insert did not return an ID.");
  }

  createdUserIds.push(userId);
  return userId;
}

async function createPendingApplication(userId: string): Promise<string> {
  const application = await applicationRepository.createApplication({
    userId,
    motivation: "I want to support learners.",
    qualifications: "Synthetic teaching experience.",
  });

  return application.id;
}

describe("teacher application decision repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Teacher application decision tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (createdUserIds.length === 0) {
      return;
    }

    await pool.query(
      `DELETE FROM teacher_applications
       WHERE user_id = ANY($1::uuid[])
          OR reviewed_by = ANY($1::uuid[])`,
      [createdUserIds],
    );

    for (const userId of createdUserIds.splice(0)) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("locks and retrieves a pending application within a transaction", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const applicationId = await createPendingApplication(applicantId);

    const application = await database.transaction(async (transaction) => {
      const repository =
        createTeacherApplicationDecisionRepository(transaction);

      return repository.findPendingApplicationForUpdate(applicationId);
    });

    expect(application).toMatchObject({
      id: applicationId,
      userId: applicantId,
      status: "pending",
    });
  });

  it("approves only a pending application and records review metadata", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const reviewerId = await createTestUser("Synthetic Reviewer");
    const applicationId = await createPendingApplication(applicantId);
    const reviewedAt = new Date();

    const approved = await database.transaction(async (transaction) => {
      const repository =
        createTeacherApplicationDecisionRepository(transaction);
      const locked =
        await repository.findPendingApplicationForUpdate(applicationId);

      expect(locked).not.toBeNull();

      return repository.approvePendingApplication({
        applicationId,
        reviewedAt,
        reviewedBy: reviewerId,
        reviewNotes: "Synthetic internal approval note.",
      });
    });

    expect(approved).toMatchObject({
      id: applicationId,
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt,
      rejectionReason: null,
      reviewNotes: "Synthetic internal approval note.",
    });

    const conflict = await database.transaction((transaction) =>
      createTeacherApplicationDecisionRepository(
        transaction,
      ).approvePendingApplication({
        applicationId,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      }),
    );

    expect(conflict).toBeNull();
  });

  it("rejects a pending application with a required reason and review metadata", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const reviewerId = await createTestUser("Synthetic Reviewer");
    const applicationId = await createPendingApplication(applicantId);
    const reviewedAt = new Date();

    const rejected = await database.transaction(async (transaction) => {
      const repository =
        createTeacherApplicationDecisionRepository(transaction);
      const locked =
        await repository.findPendingApplicationForUpdate(applicationId);

      expect(locked).not.toBeNull();

      return repository.rejectPendingApplication({
        applicationId,
        reviewedAt,
        reviewedBy: reviewerId,
        rejectionReason: "Please provide more relevant experience.",
      });
    });

    expect(rejected).toMatchObject({
      id: applicationId,
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt,
      rejectionReason: "Please provide more relevant experience.",
      reviewNotes: null,
    });
  });

  it("allows only one of two concurrent decisions to update the application", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const firstReviewerId = await createTestUser("Synthetic Reviewer One");
    const secondReviewerId = await createTestUser("Synthetic Reviewer Two");
    const applicationId = await createPendingApplication(applicantId);

    const decisions = await Promise.all([
      database.transaction((transaction) =>
        createTeacherApplicationDecisionRepository(
          transaction,
        ).approvePendingApplication({
          applicationId,
          reviewedAt: new Date(),
          reviewedBy: firstReviewerId,
        }),
      ),
      database.transaction((transaction) =>
        createTeacherApplicationDecisionRepository(
          transaction,
        ).rejectPendingApplication({
          applicationId,
          reviewedAt: new Date(),
          reviewedBy: secondReviewerId,
          rejectionReason: "Synthetic rejection reason.",
        }),
      ),
    ]);

    expect(decisions.filter(Boolean)).toHaveLength(1);
    expect(decisions.filter((decision) => decision === null)).toHaveLength(1);

    const finalApplication =
      await applicationRepository.findById(applicationId);

    expect(["approved", "rejected"]).toContain(finalApplication?.status);
  });

  it("creates a unique teacher profile and reports duplicate conflicts", async () => {
    const applicantId = await createTestUser("Synthetic Teacher");
    const repository = createTeacherApplicationDecisionRepository(database);

    const input = {
      userId: applicantId,
      displayName: "Synthetic Teacher",
      qualifications: "Synthetic teaching experience.",
    };

    const created = await repository.createTeacherProfile(input);
    const duplicate = await repository.createTeacherProfile(input);

    expect(created).toMatchObject(input);
    expect(created?.id).toEqual(expect.any(String));
    expect(duplicate).toBeNull();
  });

  it("grants the Teacher role without removing Student and reports duplicates", async () => {
    const applicantId = await createTestUser("Synthetic Teacher");

    await database.insert(roleAssignments).values({
      userId: applicantId,
      role: "student",
    });

    const repository = createTeacherApplicationDecisionRepository(database);

    await expect(repository.grantTeacherRole(applicantId)).resolves.toBe(
      "teacher",
    );
    await expect(repository.grantTeacherRole(applicantId)).resolves.toBeNull();

    const roles = await database
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, applicantId));

    expect(roles.map(({ role }) => role)).toEqual(
      expect.arrayContaining(["student", "teacher"]),
    );
    expect(roles).toHaveLength(2);
  });

  it("rolls back the application decision, profile, and role together", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const reviewerId = await createTestUser("Synthetic Reviewer");
    const applicationId = await createPendingApplication(applicantId);

    await expect(
      database.transaction(async (transaction) => {
        const repository =
          createTeacherApplicationDecisionRepository(transaction);
        const locked =
          await repository.findPendingApplicationForUpdate(applicationId);

        expect(locked).not.toBeNull();

        await repository.approvePendingApplication({
          applicationId,
          reviewedAt: new Date(),
          reviewedBy: reviewerId,
        });
        await repository.createTeacherProfile({
          userId: applicantId,
          displayName: "Synthetic Applicant",
          qualifications: "Synthetic teaching experience.",
        });
        await repository.grantTeacherRole(applicantId);

        throw new Error("Force transaction rollback.");
      }),
    ).rejects.toThrow("Force transaction rollback.");

    await expect(
      applicationRepository.findById(applicationId),
    ).resolves.toMatchObject({ status: "pending" });

    const profiles = await database
      .select()
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, applicantId));
    const roles = await database
      .select({ role: roleAssignments.role })
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, applicantId));

    expect(profiles).toHaveLength(0);
    expect(roles.map(({ role }) => role)).not.toContain("teacher");
  });
});
