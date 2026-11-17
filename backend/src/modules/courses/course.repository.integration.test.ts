import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { teacherCourseResponseSchema } from "@edutrack/contracts";
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

  it("returns public thumbnail data without exposing Cloudinary storage identifiers", async () => {
    const fixture = await createTeacherFixture();
    const created = await createTestCourse(
      fixture,
      "Synthetic thumbnail course",
    );
    const publicId = `edutrack/course-thumbnails/${testCode()}`;
    const assetId = randomUUID();

    await pool.query(
      `UPDATE courses
       SET thumbnail_public_id = $2,
           thumbnail_asset_id = $3,
           thumbnail_secure_url = $4,
           thumbnail_width = 1280,
           thumbnail_height = 720,
           thumbnail_format = 'webp'
       WHERE id = $1`,
      [
        created.id,
        publicId,
        assetId,
        "https://res.cloudinary.com/demo/image/upload/course.webp",
      ],
    );

    const course = await repository.getTeacherCourseById(
      created.id,
      fixture.teacherId,
    );

    expect(course?.thumbnail).toEqual({
      url: "https://res.cloudinary.com/demo/image/upload/course.webp",
      width: 1280,
      height: 720,
      format: "webp",
    });
    expect(() => teacherCourseResponseSchema.parse(course)).not.toThrow();
    for (const field of [
      "thumbnailPublicId",
      "thumbnailAssetId",
      "thumbnailSecureUrl",
      "thumbnailWidth",
      "thumbnailHeight",
      "thumbnailFormat",
    ]) {
      expect(course).not.toHaveProperty(field);
    }
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
       ORDER BY updated_at DESC, id DESC`,
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

  it("searches case-insensitively within the teacher's courses before pagination", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();
    const older = await createTestCourse(owner, "Cameroon Algebra Basics");
    const newer = await createTestCourse(owner, "CAMEROON Algebra Advanced");
    const otherTeacherCourse = await createTestCourse(
      anotherTeacher,
      "Cameroon Algebra Foreign",
    );
    const unrelated = await createTestCourse(owner, "Physics Mechanics");

    await pool.query(
      "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
      [older.id, "2026-11-10T10:00:00.000Z"],
    );
    await pool.query(
      "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
      [newer.id, "2026-11-12T10:00:00.000Z"],
    );
    await pool.query(
      "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
      [otherTeacherCourse.id, "2026-11-13T10:00:00.000Z"],
    );
    await pool.query("UPDATE courses SET status = 'published' WHERE id = $1", [
      older.id,
    ]);

    const firstPage = await repository.listTeacherCourses(owner.teacherId, {
      search: "cameroon algebra",
      status: "draft",
      sort: "updated_desc",
      page: 1,
      pageSize: 1,
    });
    const secondPage = await repository.listTeacherCourses(owner.teacherId, {
      search: "CAMEROON",
      sort: "updated_desc",
      page: 2,
      pageSize: 1,
    });

    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 1,
      totalPages: 1,
    });
    expect(firstPage.items.map(({ id }) => id)).toEqual([newer.id]);
    expect(secondPage.items.map(({ id }) => id)).toEqual([older.id]);
    expect(
      [...firstPage.items, ...secondPage.items].map(({ id }) => id),
    ).not.toContain(otherTeacherCourse.id);
    expect(
      [...firstPage.items, ...secondPage.items].map(({ id }) => id),
    ).not.toContain(unrelated.id);
  });

  it("supports deterministic title sorting", async () => {
    const owner = await createTeacherFixture();
    const zulu = await createTestCourse(owner, "Zulu course");
    const alphaOne = await createTestCourse(owner, "Alpha course");
    const alphaTwo = await createTestCourse(owner, "Alpha course");
    const expectedAlphaIds = await pool.query<{ id: string }>(
      `SELECT id FROM courses
       WHERE id = ANY($1::uuid[])
       ORDER BY title ASC, id ASC`,
      [[alphaOne.id, alphaTwo.id, zulu.id]],
    );

    const result = await repository.listTeacherCourses(owner.teacherId, {
      sort: "title_asc",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map(({ id }) => id)).toEqual(
      expectedAlphaIds.rows.map(({ id }) => id),
    );
  });

  it("counts supported statuses only for the requested teacher", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();

    const draft = await createTestCourse(owner, "Owner draft");
    const pending = await createTestCourse(owner, "Owner in review");
    const published = await createTestCourse(owner, "Owner published");
    const rejected = await createTestCourse(owner, "Owner rejected");
    const otherCourse = await createTestCourse(
      anotherTeacher,
      "Other teacher course",
    );

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [pending.id],
    );
    await pool.query("UPDATE courses SET status = 'published' WHERE id = $1", [
      published.id,
    ]);
    await pool.query("UPDATE courses SET status = 'rejected' WHERE id = $1", [
      rejected.id,
    ]);

    const summary = await repository.getTeacherDashboardSummary(
      owner.teacherId,
    );

    expect(summary.statusCounts).toEqual({
      total: 4,
      draft: 1,
      pendingReview: 1,
      published: 1,
      rejected: 1,
    });
    expect(summary.recentDraftCourses).toEqual([
      expect.objectContaining({
        id: draft.id,
        title: "Owner draft",
        status: "draft",
      }),
    ]);
    expect(summary.recentDraftCourses.map(({ id }) => id)).not.toContain(
      otherCourse.id,
    );
  });

  it("returns the three most recently updated drafts with a deterministic ID tie-breaker", async () => {
    const owner = await createTeacherFixture();
    const tiedFirst = await createTestCourse(owner, "Tied draft one");
    const tiedSecond = await createTestCourse(owner, "Tied draft two");
    const next = await createTestCourse(owner, "Next draft");
    const oldest = await createTestCourse(owner, "Oldest draft");

    const tiedTimestamp = "2026-11-16T10:00:00.000Z";
    const nextTimestamp = "2026-11-15T10:00:00.000Z";
    const oldestTimestamp = "2026-11-14T10:00:00.000Z";

    for (const course of [tiedFirst, tiedSecond]) {
      await pool.query(
        "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
        [course.id, tiedTimestamp],
      );
    }
    await pool.query(
      "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
      [next.id, nextTimestamp],
    );
    await pool.query(
      "UPDATE courses SET updated_at = $2::timestamptz WHERE id = $1",
      [oldest.id, oldestTimestamp],
    );

    const expectedTieOrder = await pool.query<{ id: string }>(
      `SELECT id FROM courses
       WHERE id = ANY($1::uuid[])
       ORDER BY id DESC`,
      [[tiedFirst.id, tiedSecond.id]],
    );
    const summary = await repository.getTeacherDashboardSummary(
      owner.teacherId,
    );

    expect(summary.recentDraftCourses).toHaveLength(3);
    expect(summary.recentDraftCourses.map(({ id }) => id)).toEqual([
      ...expectedTieOrder.rows.map(({ id }) => id),
      next.id,
    ]);
    expect(
      summary.recentDraftCourses.map(({ updatedAt }) => updatedAt),
    ).toEqual([tiedTimestamp, tiedTimestamp, nextTimestamp]);
  });

  it("returns zero counts and no recent drafts for an empty teacher", async () => {
    const emptyTeacher = await createTeacherFixture();

    await expect(
      repository.getTeacherDashboardSummary(emptyTeacher.teacherId),
    ).resolves.toEqual({
      statusCounts: {
        total: 0,
        draft: 0,
        pendingReview: 0,
        published: 0,
        rejected: 0,
      },
      recentDraftCourses: [],
    });
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
