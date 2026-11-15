import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import {
  createCourseRepository,
  type CreateCourseData,
} from "./course.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createCourseRepository(database);

const createdCourseIds: string[] = [];
const createdUserIds: string[] = [];
const createdAcademicLevelIds: string[] = [];
const createdSubjectIds: string[] = [];

function testCode(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function waitForCourseUpdateLock(): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND wait_event_type = 'Lock'
           AND query ILIKE 'update "courses"%'
       ) AS waiting`,
    );

    if (result.rows[0]?.waiting) {
      return;
    }

    await delay(10);
  }

  throw new Error("Timed out waiting for the course update row lock.");
}

async function createTeacherFixture() {
  const suffix = testCode();

  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `course-repository-${suffix}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Synthetic Course Teacher",
    ],
  );

  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error("Test user insert did not return an ID.");
  }

  createdUserIds.push(userId);

  const profileResult = await pool.query<{ id: string }>(
    `INSERT INTO teacher_profiles (user_id, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, "Synthetic Course Teacher"],
  );

  const teacherId = profileResult.rows[0]?.id;

  if (!teacherId) {
    throw new Error("Test teacher profile insert did not return an ID.");
  }

  const levelResult = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3)
     RETURNING id`,
    [
      `course-test-${suffix}`,
      `Synthetic Form ${suffix}`,
      20_000 + Math.floor(Math.random() * 5_000),
    ],
  );

  const academicLevelId = levelResult.rows[0]?.id;

  if (!academicLevelId) {
    throw new Error("Test academic-level insert did not return an ID.");
  }

  createdAcademicLevelIds.push(academicLevelId);

  const subjectResult = await pool.query<{ id: string }>(
    `INSERT INTO subjects (code, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`course-test-${suffix}`, `Synthetic Subject ${suffix}`, 30_000],
  );

  const subjectId = subjectResult.rows[0]?.id;

  if (!subjectId) {
    throw new Error("Test subject insert did not return an ID.");
  }

  createdSubjectIds.push(subjectId);

  return { teacherId, academicLevelId, subjectId };
}

async function createTestCourse(
  fixture: Awaited<ReturnType<typeof createTeacherFixture>>,
  title = "Synthetic test course",
) {
  const data: CreateCourseData = {
    teacherId: fixture.teacherId,
    title,
    academicLevelId: fixture.academicLevelId,
    subjectId: fixture.subjectId,
  };

  const course = await repository.createCourse(data);
  createdCourseIds.push(course.id);

  return course;
}

describe("course repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Course repository tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (createdCourseIds.length > 0) {
      await pool.query("DELETE FROM courses WHERE id = ANY($1::uuid[])", [
        createdCourseIds.splice(0),
      ]);
    }

    if (createdUserIds.length > 0) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        createdUserIds.splice(0),
      ]);
    }

    if (createdAcademicLevelIds.length > 0) {
      await pool.query(
        "DELETE FROM academic_levels WHERE id = ANY($1::uuid[])",
        [createdAcademicLevelIds.splice(0)],
      );
    }

    if (createdSubjectIds.length > 0) {
      await pool.query("DELETE FROM subjects WHERE id = ANY($1::uuid[])", [
        createdSubjectIds.splice(0),
      ]);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a draft course and joins its academic level and subject", async () => {
    const fixture = await createTeacherFixture();

    const course = await createTestCourse(fixture, "Synthetic Algebra");

    expect(course).toMatchObject({
      title: "Synthetic Algebra",
      description: null,
      status: "draft",
      academicLevel: {
        id: fixture.academicLevelId,
        name: expect.stringContaining("Synthetic Form"),
        educationStage: "lower_secondary",
      },
      subject: {
        id: fixture.subjectId,
        name: expect.stringContaining("Synthetic Subject"),
      },
    });
    expect(course.id).toEqual(expect.any(String));
    expect(course.createdAt).toEqual(expect.any(String));
    expect(course.updatedAt).toEqual(expect.any(String));
    expect(course).not.toHaveProperty("teacherId");
  });

  it("rejects catalog IDs that do not exist in PostgreSQL", async () => {
    const fixture = await createTeacherFixture();

    await expect(
      repository.createCourse({
        teacherId: fixture.teacherId,
        title: "Invalid level reference",
        academicLevelId: randomUUID(),
        subjectId: fixture.subjectId,
      }),
    ).rejects.toThrow();

    const course = await createTestCourse(fixture, "Valid reference target");

    await expect(
      repository.updateTeacherCourse(course.id, fixture.teacherId, {
        subjectId: randomUUID(),
      }),
    ).rejects.toThrow();

    await expect(
      repository.getTeacherCourseById(course.id, fixture.teacherId),
    ).resolves.toMatchObject({
      subject: { id: fixture.subjectId },
      status: "draft",
    });
  });

  it("lists only the teacher's courses with status filtering and accurate pagination", async () => {
    const teacher = await createTeacherFixture();
    const otherTeacher = await createTeacherFixture();

    const first = await createTestCourse(teacher, "First synthetic course");
    const second = await createTestCourse(teacher, "Second synthetic course");
    const other = await createTestCourse(otherTeacher, "Other teacher course");
    const emptyTeacher = await createTeacherFixture();

    await pool.query("UPDATE courses SET status = 'published' WHERE id = $1", [
      second.id,
    ]);

    const firstPage = await repository.listTeacherCourses(teacher.teacherId, {
      page: 1,
      pageSize: 1,
    });
    const secondPage = await repository.listTeacherCourses(teacher.teacherId, {
      page: 2,
      pageSize: 1,
    });
    const draftCourses = await repository.listTeacherCourses(
      teacher.teacherId,
      {
        status: "draft",
        page: 1,
        pageSize: 20,
      },
    );
    const publishedCourses = await repository.listTeacherCourses(
      teacher.teacherId,
      {
        status: "published",
        page: 1,
        pageSize: 20,
      },
    );
    const expectedOrder = await pool.query<{ id: string }>(
      `SELECT id FROM courses
       WHERE teacher_id = $1
       ORDER BY created_at DESC, id DESC`,
      [teacher.teacherId],
    );
    const emptyPage = await repository.listTeacherCourses(
      emptyTeacher.teacherId,
      { page: 1, pageSize: 20 },
    );

    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(secondPage.items).toHaveLength(1);
    expect(
      [...firstPage.items, ...secondPage.items].map(({ id }) => id),
    ).toEqual(expectedOrder.rows.map(({ id }) => id));
    expect(draftCourses.items.map(({ id }) => id)).toEqual([first.id]);
    expect(publishedCourses.items.map(({ id }) => id)).toEqual([second.id]);
    expect(
      [...firstPage.items, ...secondPage.items].some(
        ({ id }) => id === other.id,
      ),
    ).toBe(false);
    expect(emptyPage).toEqual({
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });

    const repeatedFirstPage = await repository.listTeacherCourses(
      teacher.teacherId,
      { page: 1, pageSize: 1 },
    );
    expect(repeatedFirstPage.items.map(({ id }) => id)).toEqual(
      firstPage.items.map(({ id }) => id),
    );
  });

  it("returns a course only to its owner and hides other teachers' courses", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();
    const course = await createTestCourse(owner);

    await expect(
      repository.getTeacherCourseById(course.id, owner.teacherId),
    ).resolves.toMatchObject({ id: course.id });

    await expect(
      repository.getTeacherCourseById(course.id, anotherTeacher.teacherId),
    ).resolves.toBeNull();

    await expect(
      repository.getTeacherCourseById(randomUUID(), owner.teacherId),
    ).resolves.toBeNull();
  });

  it("updates draft courses but rejects updates after submission", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();
    const course = await createTestCourse(owner, "Editable draft");

    await expect(
      repository.updateTeacherCourse(course.id, owner.teacherId, {
        title: "Updated draft",
        description: "Updated synthetic description.",
      }),
    ).resolves.toMatchObject({
      kind: "updated",
      course: {
        id: course.id,
        title: "Updated draft",
        description: "Updated synthetic description.",
        status: "draft",
      },
    });

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [course.id],
    );

    await expect(
      repository.updateTeacherCourse(course.id, owner.teacherId, {
        title: "Should not be applied",
      }),
    ).resolves.toEqual({ kind: "not_editable" });

    await expect(
      repository.updateTeacherCourse(course.id, anotherTeacher.teacherId, {
        title: "Foreign course update",
      }),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(
      repository.updateTeacherCourse(randomUUID(), owner.teacherId, {
        title: "Missing course update",
      }),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(
      repository.getTeacherCourseById(course.id, owner.teacherId),
    ).resolves.toMatchObject({
      title: "Updated draft",
      status: "pending_review",
    });
  });

  it("does not update a draft after a concurrent status transition", async () => {
    const fixture = await createTeacherFixture();
    const course = await createTestCourse(fixture, "Concurrent draft");
    const transitionClient = await pool.connect();
    let transactionOpen = false;

    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;

      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [course.id],
      );

      const updatePromise = repository.updateTeacherCourse(
        course.id,
        fixture.teacherId,
        { title: "Must not be applied" },
      );

      await waitForCourseUpdateLock();

      await transitionClient.query(
        "UPDATE courses SET status = 'pending_review' WHERE id = $1",
        [course.id],
      );
      await transitionClient.query("COMMIT");
      transactionOpen = false;

      await expect(updatePromise).resolves.toEqual({
        kind: "not_editable",
      });

      await expect(
        repository.getTeacherCourseById(course.id, fixture.teacherId),
      ).resolves.toMatchObject({
        title: "Concurrent draft",
        status: "pending_review",
      });
    } finally {
      if (transactionOpen) {
        await transitionClient.query("ROLLBACK");
      }

      transitionClient.release();
    }
  });
});
