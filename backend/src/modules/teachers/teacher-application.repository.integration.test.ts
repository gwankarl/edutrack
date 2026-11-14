import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { teacherApplications } from "../../infrastructure/database/schema/teacher-applications.js";
import {
  createTeacherApplicationRepository,
  PendingTeacherApplicationExistsError,
} from "./teacher-application.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createTeacherApplicationRepository(database);
const createdUserIds: string[] = [];

async function createTestUser(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `teacher-repository-${randomUUID()}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Teacher Repository Test User",
    ],
  );

  const userId = result.rows[0].id;
  createdUserIds.push(userId);
  return userId;
}

function createApplicationInput(userId: string) {
  return {
    userId,
    motivation: "I want to support learners.",
    qualifications: "Synthetic teaching experience.",
  };
}

describe("teacher application repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Teacher application repository tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a pending application using database defaults", async () => {
    const userId = await createTestUser();

    const application = await repository.createApplication(
      createApplicationInput(userId),
    );

    expect(application).toMatchObject({
      userId,
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
    });
    expect(application.id).toEqual(expect.any(String));
    expect(application.submittedAt).toBeInstanceOf(Date);
  });

  it("finds the latest application and reports pending status", async () => {
    const userId = await createTestUser();
    const firstApplication = await repository.createApplication(
      createApplicationInput(userId),
    );

    await database
      .update(teacherApplications)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: userId,
        submittedAt: new Date(Date.now() - 60_000),
      })
      .where(eq(teacherApplications.id, firstApplication.id));

    const latestApplication = await repository.createApplication(
      createApplicationInput(userId),
    );

    await expect(repository.findLatestByUserId(userId)).resolves.toMatchObject({
      id: latestApplication.id,
      status: "pending",
    });
    await expect(repository.hasPendingApplication(userId)).resolves.toBe(true);

    await database
      .update(teacherApplications)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: userId,
      })
      .where(eq(teacherApplications.id, latestApplication.id));

    await expect(repository.hasPendingApplication(userId)).resolves.toBe(false);
  });

  it("finds an application by ID and returns null for an unknown ID", async () => {
    const userId = await createTestUser();
    const application = await repository.createApplication(
      createApplicationInput(userId),
    );

    await expect(repository.findById(application.id)).resolves.toMatchObject({
      id: application.id,
      userId,
    });
    await expect(repository.findById(randomUUID())).resolves.toBeNull();
  });

  it("translates the pending unique-index violation into a typed error", async () => {
    const userId = await createTestUser();
    const input = createApplicationInput(userId);

    await repository.createApplication(input);

    await expect(repository.createApplication(input)).rejects.toBeInstanceOf(
      PendingTeacherApplicationExistsError,
    );
  });

  it("allows only one concurrent pending submission for the same user", async () => {
    const userId = await createTestUser();
    const input = createApplicationInput(userId);

    const results = await Promise.allSettled([
      repository.createApplication(input),
      repository.createApplication(input),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.any(PendingTeacherApplicationExistsError),
    });
  });

  it("works inside a Drizzle transaction and rolls back with it", async () => {
    const userId = await createTestUser();
    const rollbackUserId = await createTestUser();
    const input = createApplicationInput(userId);

    const applicationId = await database.transaction(async (transaction) => {
      const transactionRepository =
        createTeacherApplicationRepository(transaction);
      const application = await transactionRepository.createApplication(input);

      return application.id;
    });

    await expect(repository.findById(applicationId)).resolves.not.toBeNull();

    await expect(
      database.transaction(async (transaction) => {
        const transactionRepository =
          createTeacherApplicationRepository(transaction);

        await transactionRepository.createApplication(
          createApplicationInput(rollbackUserId),
        );

        throw new Error("Force transaction rollback.");
      }),
    ).rejects.toThrow("Force transaction rollback.");

    await expect(
      repository.findLatestByUserId(rollbackUserId),
    ).resolves.toBeNull();
  });
});
