import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../src/infrastructure/config/env.js";
import { createDatabasePool } from "../../src/infrastructure/database/pool.js";

const pool = createDatabasePool(loadEnvironment());

async function createUser(): Promise<string> {
  const email = `teacher-schema-${randomUUID()}@example.test`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [email, "synthetic-test-password-hash", "Teacher Schema Test User"],
  );

  return result.rows[0].id;
}

async function expectSqlState(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  let caught: unknown;

  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeDefined();

  if (typeof caught !== "object" || caught === null || !("code" in caught)) {
    throw new Error("Expected a PostgreSQL error with a SQLSTATE code.");
  }

  expect(caught.code).toBe(expectedCode);
}

async function insertApplication(
  userId: string,
  fields: {
    status?: "pending" | "approved" | "rejected";
    reviewedAt?: Date | null;
    reviewedBy?: string | null;
    reviewNotes?: string | null;
  } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO teacher_applications
       (user_id, motivation, qualifications, status, reviewed_at, reviewed_by, review_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      "I want to support learners.",
      "Synthetic teaching experience.",
      fields.status ?? "pending",
      fields.reviewedAt ?? null,
      fields.reviewedBy ?? null,
      fields.reviewNotes ?? null,
    ],
  );
}

describe("teacher application and profile database schemas", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error("Teacher schema tests may only write to edutrack_test.");
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("inserts a pending application with its default status and timestamp", async () => {
    const userId = await createUser();

    try {
      const result = await pool.query<{
        id: string;
        status: string;
        submitted_at: Date;
        reviewed_at: Date | null;
        reviewed_by: string | null;
        review_notes: string | null;
      }>(
        `INSERT INTO teacher_applications (user_id, motivation, qualifications)
         VALUES ($1, $2, $3)
         RETURNING id, status, submitted_at, reviewed_at, reviewed_by, review_notes`,
        [
          userId,
          "I want to support learners.",
          "Synthetic teaching experience.",
        ],
      );

      expect(result.rows[0]).toMatchObject({
        status: "pending",
        reviewed_at: null,
        reviewed_by: null,
        review_notes: null,
      });
      expect(result.rows[0].id).toEqual(expect.any(String));
      expect(result.rows[0].submitted_at).toBeInstanceOf(Date);
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("accepts approved and rejected decisions with required review metadata", async () => {
    const applicantId = await createUser();
    const reviewerId = await createUser();
    const reviewedAt = new Date();

    try {
      await insertApplication(applicantId, {
        status: "approved",
        reviewedAt,
        reviewedBy: reviewerId,
      });
      await insertApplication(applicantId, {
        status: "rejected",
        reviewedAt,
        reviewedBy: reviewerId,
        reviewNotes: "Please provide more relevant teaching experience.",
      });

      const result = await pool.query<{ status: string; count: string }>(
        `SELECT status, count(*)::text AS count
         FROM teacher_applications
         WHERE user_id = $1
         GROUP BY status`,
        [applicantId],
      );

      expect(result.rows).toEqual(
        expect.arrayContaining([
          { status: "approved", count: "1" },
          { status: "rejected", count: "1" },
        ]),
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [applicantId]);
      await pool.query("DELETE FROM users WHERE id = $1", [reviewerId]);
    }
  });

  it("rejects missing review metadata and missing or blank rejection reasons", async () => {
    const userId = await createUser();
    const missingUserId = await createUser();

    try {
      await expectSqlState(
        insertApplication(userId, {
          status: "approved",
          reviewedBy: userId,
        }),
        "23514",
      );
      await expectSqlState(
        insertApplication(userId, {
          status: "approved",
          reviewedAt: new Date(),
        }),
        "23514",
      );
      await expectSqlState(
        insertApplication(userId, {
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: userId,
        }),
        "23514",
      );
      await expectSqlState(
        insertApplication(userId, {
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: userId,
          reviewNotes: "   ",
        }),
        "23514",
      );
      await expectSqlState(
        insertApplication(userId, {
          reviewedAt: new Date(),
          reviewedBy: userId,
        }),
        "23514",
      );

      await expectSqlState(
        pool.query(
          `INSERT INTO teacher_applications
             (user_id, motivation, qualifications, status)
           VALUES ($1, $2, $3, 'withdrawn')`,
          [
            missingUserId,
            "I want to support learners.",
            "Synthetic teaching experience.",
          ],
        ),
        "22P02",
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      await pool.query("DELETE FROM users WHERE id = $1", [missingUserId]);
    }
  });

  it("prevents multiple pending applications but permits a new one after review", async () => {
    const userId = await createUser();

    try {
      const first = await pool.query<{ id: string }>(
        `INSERT INTO teacher_applications (user_id, motivation, qualifications)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [
          userId,
          "I want to support learners.",
          "Synthetic teaching experience.",
        ],
      );

      await expectSqlState(insertApplication(userId), "23505");

      await pool.query(
        `UPDATE teacher_applications
         SET status = 'approved', reviewed_at = now(), reviewed_by = $2
         WHERE id = $1`,
        [first.rows[0].id, userId],
      );
      await insertApplication(userId);

      const pending = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM teacher_applications
         WHERE user_id = $1 AND status = 'pending'`,
        [userId],
      );
      expect(pending.rows[0].count).toBe("1");
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("enforces applicant, reviewer, and profile user foreign keys", async () => {
    const applicantId = await createUser();
    const missingUserId = randomUUID();

    try {
      await expectSqlState(insertApplication(missingUserId), "23503");
      await expectSqlState(
        insertApplication(applicantId, {
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: missingUserId,
        }),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO teacher_profiles (user_id, display_name)
           VALUES ($1, $2)`,
          [missingUserId, "Synthetic Teacher"],
        ),
        "23503",
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [applicantId]);
    }
  });

  it("inserts a profile with timestamp defaults and no implicit Teacher role", async () => {
    const userId = await createUser();

    try {
      const result = await pool.query<{
        id: string;
        display_name: string;
        biography: string | null;
        qualifications: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO teacher_profiles (user_id, display_name)
         VALUES ($1, $2)
         RETURNING id, display_name, biography, qualifications, created_at, updated_at`,
        [userId, "Synthetic Teacher"],
      );

      expect(result.rows[0]).toMatchObject({
        display_name: "Synthetic Teacher",
        biography: null,
        qualifications: null,
      });
      expect(result.rows[0].id).toEqual(expect.any(String));
      expect(result.rows[0].created_at).toBeInstanceOf(Date);
      expect(result.rows[0].updated_at).toBeInstanceOf(Date);

      const roles = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM role_assignments
         WHERE user_id = $1 AND role = 'teacher'`,
        [userId],
      );
      expect(roles.rows[0].count).toBe("0");
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("enforces one teacher profile per user", async () => {
    const userId = await createUser();

    try {
      await pool.query(
        `INSERT INTO teacher_profiles (user_id, display_name)
         VALUES ($1, $2)`,
        [userId, "First Synthetic Profile"],
      );

      await expectSqlState(
        pool.query(
          `INSERT INTO teacher_profiles (user_id, display_name)
           VALUES ($1, $2)`,
          [userId, "Duplicate Synthetic Profile"],
        ),
        "23505",
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });
});
