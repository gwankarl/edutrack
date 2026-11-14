import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { teacherApplications } from "../../infrastructure/database/schema/teacher-applications.js";
import { createTeacherApplicationReviewRepository } from "./teacher-application-review.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createTeacherApplicationReviewRepository(database);
const createdUserIds: string[] = [];

async function createTestUser(displayName: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `teacher-review-${randomUUID()}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      displayName,
    ],
  );

  const userId = result.rows[0].id;
  createdUserIds.push(userId);
  return userId;
}

async function insertApplication(
  userId: string,
  fields: {
    id?: string;
    status?: "pending" | "approved" | "rejected";
    submittedAt?: Date;
    reviewedAt?: Date | null;
    reviewedBy?: string | null;
    rejectionReason?: string | null;
    reviewNotes?: string | null;
  } = {},
): Promise<string> {
  const [application] = await database
    .insert(teacherApplications)
    .values({
      userId,
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
      ...fields,
    })
    .returning({ id: teacherApplications.id });

  if (!application) {
    throw new Error("Test application insert did not return a row.");
  }

  return application.id;
}

describe("teacher application review repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Teacher application review tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await pool.query(
        "DELETE FROM teacher_applications WHERE user_id = ANY($1::uuid[])",
        [createdUserIds],
      );

      for (const userId of createdUserIds.splice(0)) {
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      }
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("lists applications with deterministic ordering and pagination metadata", async () => {
    const baseline = await repository.listApplications({
      page: 1,
      pageSize: 1,
    });
    const userIds = await Promise.all([
      createTestUser("Synthetic Applicant One"),
      createTestUser("Synthetic Applicant Two"),
      createTestUser("Synthetic Applicant Three"),
    ]);
    const submittedAt = new Date("9999-12-31T12:00:00.000Z");
    const ids: string[] = [];

    for (const userId of userIds) {
      ids.push(await insertApplication(userId, { submittedAt }));
    }

    const firstPage = await repository.listApplications({
      page: 1,
      pageSize: 2,
    });
    const secondPage = await repository.listApplications({
      page: 2,
      pageSize: 2,
    });
    const descendingIds = [...ids].sort((left, right) =>
      left < right ? 1 : left > right ? -1 : 0,
    );

    expect(firstPage.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      totalItems: baseline.pagination.totalItems + 3,
      totalPages: Math.ceil((baseline.pagination.totalItems + 3) / 2),
    });
    expect(firstPage.items.map(({ id }) => id)).toEqual(
      descendingIds.slice(0, 2),
    );
    expect(secondPage.items[0]?.id).toBe(descendingIds[2]);
    expect(firstPage.items[0]?.applicant).toMatchObject({
      displayName: expect.stringMatching(/^Synthetic Applicant/),
      email: expect.stringContaining("teacher-review-"),
    });
  });

  it("filters by status and includes reviewer details and administrator notes", async () => {
    const baseline = await repository.listApplications({
      status: "rejected",
      page: 1,
      pageSize: 1,
    });
    const applicantId = await createTestUser("Synthetic Rejected Applicant");
    const reviewerId = await createTestUser("Synthetic Reviewer");

    await insertApplication(applicantId, {
      status: "rejected",
      reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
      reviewedBy: reviewerId,
      rejectionReason: "Please provide more relevant experience.",
      reviewNotes: "Internal synthetic administrator note.",
    });

    const result = await repository.listApplications({
      status: "rejected",
      page: 1,
      pageSize: 20,
    });

    expect(result.pagination.totalItems).toBe(
      baseline.pagination.totalItems + 1,
    );
    expect(result.items.every(({ status }) => status === "rejected")).toBe(
      true,
    );
    const insertedResult = result.items.find(
      ({ applicant }) => applicant.id === applicantId,
    );
    expect(insertedResult).toMatchObject({
      status: "rejected",
      applicant: { displayName: "Synthetic Rejected Applicant" },
      reviewer: { displayName: "Synthetic Reviewer" },
      rejectionReason: "Please provide more relevant experience.",
      reviewNotes: "Internal synthetic administrator note.",
    });
  });

  it("retrieves one application by UUID and returns null when missing", async () => {
    const applicantId = await createTestUser("Synthetic Detail Applicant");
    const reviewerId = await createTestUser("Synthetic Detail Reviewer");
    const applicationId = await insertApplication(applicantId, {
      status: "approved",
      reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
      reviewedBy: reviewerId,
      reviewNotes: "Internal approval context.",
    });

    const application = await repository.findById(applicationId);

    expect(application).toMatchObject({
      id: applicationId,
      status: "approved",
      applicant: {
        id: applicantId,
        displayName: "Synthetic Detail Applicant",
      },
      reviewer: {
        id: reviewerId,
        displayName: "Synthetic Detail Reviewer",
      },
      reviewNotes: "Internal approval context.",
    });
    expect(application).not.toHaveProperty("passwordHash");
    expect(application).not.toHaveProperty("sessionTokenHash");
    expect(application).not.toHaveProperty("reviewedBy");
    expect(application?.applicant).not.toHaveProperty("passwordHash");
    expect(application?.reviewer).not.toHaveProperty("passwordHash");

    await expect(repository.findById(randomUUID())).resolves.toBeNull();
  });

  it("returns an empty page for a status with no matching applications", async () => {
    const firstPage = await repository.listApplications({
      status: "approved",
      page: 1,
      pageSize: 1,
    });
    const result = await repository.listApplications({
      status: "approved",
      page: firstPage.pagination.totalPages + 1,
      pageSize: 1,
    });

    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({
      page: firstPage.pagination.totalPages + 1,
      pageSize: 1,
      totalItems: firstPage.pagination.totalItems,
      totalPages: firstPage.pagination.totalPages,
    });
  });
});
