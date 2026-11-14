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
import {
  createTeacherApplicationDecisionService,
  TeacherApplicationDecisionConflictError,
} from "./teacher-application-decision.service.js";

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
      `decision-service-${randomUUID()}@example.test`,
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

function createService() {
  return createTeacherApplicationDecisionService({
    withTransaction: (operation) =>
      database.transaction((transaction) =>
        operation(createTeacherApplicationDecisionRepository(transaction)),
      ),
  });
}

async function findRoles(userId: string): Promise<string[]> {
  const roles = await database
    .select({ role: roleAssignments.role })
    .from(roleAssignments)
    .where(eq(roleAssignments.userId, userId));

  return roles.map(({ role }) => role);
}

describe("teacher application decision service integration", () => {
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

  it("approves atomically, preserving Student and creating profile and Teacher role", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const administratorId = await createTestUser("Synthetic Administrator");
    const applicationId = await createPendingApplication(applicantId);

    await database.insert(roleAssignments).values({
      userId: applicantId,
      role: "student",
    });

    const result = await createService().approveApplication(
      applicationId,
      administratorId,
      { reviewNotes: "Synthetic internal approval note." },
    );

    const application = await applicationRepository.findById(applicationId);
    const [profile] = await database
      .select()
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, applicantId));

    expect(result).toMatchObject({
      applicationId,
      status: "approved",
      reviewer: {
        id: administratorId,
        displayName: "Synthetic Administrator",
      },
    });
    expect(Date.parse(result.reviewedAt)).not.toBeNaN();
    expect(application).toMatchObject({
      status: "approved",
      reviewedBy: administratorId,
      reviewNotes: "Synthetic internal approval note.",
    });
    expect(profile).toMatchObject({
      userId: applicantId,
      displayName: "Synthetic Applicant",
      qualifications: "Synthetic teaching experience.",
    });
    expect(await findRoles(applicantId)).toEqual(
      expect.arrayContaining(["student", "teacher"]),
    );
    expect(result).not.toHaveProperty("reviewNotes");
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|sessionTokenHash|password_hash|session_token_hash/i,
    );
  });

  it("rejects with the reason and grants no Teacher role or profile", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const administratorId = await createTestUser("Synthetic Administrator");
    const applicationId = await createPendingApplication(applicantId);

    await database.insert(roleAssignments).values({
      userId: applicantId,
      role: "student",
    });

    const result = await createService().rejectApplication(
      applicationId,
      administratorId,
      { rejectionReason: "Please provide more relevant experience." },
    );

    const application = await applicationRepository.findById(applicationId);
    const profiles = await database
      .select()
      .from(teacherProfiles)
      .where(eq(teacherProfiles.userId, applicantId));

    expect(result).toMatchObject({
      applicationId,
      status: "rejected",
      reviewer: { id: administratorId },
    });
    expect(application).toMatchObject({
      status: "rejected",
      reviewedBy: administratorId,
      rejectionReason: "Please provide more relevant experience.",
    });
    expect(await findRoles(applicantId)).toEqual(["student"]);
    expect(profiles).toHaveLength(0);
  });

  it("rolls back the application update when a duplicate profile conflicts", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const administratorId = await createTestUser("Synthetic Administrator");
    const applicationId = await createPendingApplication(applicantId);

    await database.insert(teacherProfiles).values({
      userId: applicantId,
      displayName: "Existing Synthetic Profile",
    });

    await expect(
      createService().approveApplication(applicationId, administratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionConflictError);

    await expect(
      applicationRepository.findById(applicationId),
    ).resolves.toMatchObject({ status: "pending", reviewedBy: null });
    expect(await findRoles(applicantId)).not.toContain("teacher");
  });

  it("allows only one concurrent decision and rejects a repeated decision", async () => {
    const applicantId = await createTestUser("Synthetic Applicant");
    const firstAdministratorId = await createTestUser("Synthetic Admin One");
    const secondAdministratorId = await createTestUser("Synthetic Admin Two");
    const applicationId = await createPendingApplication(applicantId);
    const service = createService();

    const outcomes = await Promise.allSettled([
      service.approveApplication(applicationId, firstAdministratorId, {}),
      service.rejectApplication(applicationId, secondAdministratorId, {
        rejectionReason: "Synthetic rejection reason.",
      }),
    ]);

    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );

    const rejectedOutcome = outcomes.find(
      (outcome) => outcome.status === "rejected",
    );
    expect(rejectedOutcome).toMatchObject({
      status: "rejected",
      reason: expect.any(TeacherApplicationDecisionConflictError),
    });

    await expect(
      service.approveApplication(applicationId, firstAdministratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionConflictError);
  });
});
