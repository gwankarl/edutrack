import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createQuizRepository } from "./quiz.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createQuizRepository(database);

const createdCourseIds: string[] = [];
const createdUserIds: string[] = [];
const createdAcademicLevelIds: string[] = [];
const createdSubjectIds: string[] = [];

function testCode(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function createTeacherFixture() {
  const suffix = testCode();
  const sortOrder = 10_000 + Math.floor(Math.random() * 20_000);

  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      `quiz-repository-${suffix}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Synthetic Quiz Teacher",
    ],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("Test user insert did not return an ID.");
  createdUserIds.push(userId);

  const profileResult = await pool.query<{ id: string }>(
    `INSERT INTO teacher_profiles (user_id, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, "Synthetic Quiz Teacher"],
  );
  const teacherId = profileResult.rows[0]?.id;
  if (!teacherId) throw new Error("Test profile insert did not return an ID.");

  const levelResult = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3)
     RETURNING id`,
    [`quiz-test-${suffix}`, `Synthetic Form ${suffix}`, sortOrder],
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
    [`quiz-test-${suffix}`, `Synthetic Subject ${suffix}`, sortOrder],
  );
  const subjectId = subjectResult.rows[0]?.id;
  if (!subjectId) throw new Error("Test subject insert did not return an ID.");
  createdSubjectIds.push(subjectId);

  const courseResult = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ["Synthetic quiz test course", academicLevelId, subjectId, teacherId],
  );
  const courseId = courseResult.rows[0]?.id;
  if (!courseId) throw new Error("Test course insert did not return an ID.");
  createdCourseIds.push(courseId);

  const topicResult = await pool.query<{ id: string }>(
    `INSERT INTO topics (course_id, title, position)
     VALUES ($1, $2, 1)
     RETURNING id`,
    [courseId, "Synthetic quiz test topic"],
  );
  const topicId = topicResult.rows[0]?.id;
  if (!topicId) throw new Error("Test topic insert did not return an ID.");

  return { courseId, topicId, teacherId };
}

async function waitForCourseLock(): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid <> pg_backend_pid()
           AND wait_event_type = 'Lock'
           AND query ILIKE '%from "courses"%for update%'
       ) AS waiting`,
    );

    if (result.rows[0]?.waiting) return;
    await delay(10);
  }

  throw new Error("Timed out waiting for the quiz mutation course lock.");
}

describe("quiz repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error("Quiz repository tests may only write to edutrack_test.");
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

  it("creates quizzes with default Draft parent and server-assigned positions", async () => {
    const fixture = await createTeacherFixture();

    const [first, second] = await Promise.all([
      repository.createQuiz(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        { title: "First quiz" },
      ),
      repository.createQuiz(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        {
          title: "Second quiz",
          description: "Synthetic draft description",
        },
      ),
    ]);

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");

    const quizzes = await repository.listTopicQuizzes(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );

    expect(quizzes.map(({ position }) => position)).toEqual([1, 2]);
    expect(quizzes.map(({ title }) => title)).toEqual(
      expect.arrayContaining(["First quiz", "Second quiz"]),
    );
    expect(quizzes.every(({ topicId }) => topicId === fixture.topicId)).toBe(
      true,
    );
    expect(quizzes.find(({ title }) => title === "First quiz")).toMatchObject({
      description: null,
    });
    expect(quizzes.find(({ title }) => title === "Second quiz")).toMatchObject({
      description: "Synthetic draft description",
    });
    expect(quizzes[0]?.createdAt).toEqual(expect.any(String));
    expect(quizzes[0]?.updatedAt).toEqual(expect.any(String));
  });

  it("scopes list and retrieval to the specified course, topic, and teacher", async () => {
    const owner = await createTeacherFixture();
    const otherTeacher = await createTeacherFixture();

    const created = await repository.createQuiz(
      owner.courseId,
      owner.topicId,
      owner.teacherId,
      { title: "Owner quiz" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.listTopicQuizzes(
        owner.courseId,
        owner.topicId,
        otherTeacher.teacherId,
      ),
    ).resolves.toEqual([]);

    await expect(
      repository.getQuizById(
        owner.courseId,
        owner.topicId,
        created.quiz.id,
        otherTeacher.teacherId,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.getQuizById(
        owner.courseId,
        otherTeacher.topicId,
        created.quiz.id,
        owner.teacherId,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.getQuizById(
        owner.courseId,
        owner.topicId,
        created.quiz.id,
        owner.teacherId,
      ),
    ).resolves.toMatchObject({ id: created.quiz.id });
  });

  it("rejects a topic that does not belong to the requested course", async () => {
    const owner = await createTeacherFixture();
    const other = await createTeacherFixture();

    await expect(
      repository.createQuiz(owner.courseId, other.topicId, owner.teacherId, {
        title: "Must not be created",
      }),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(
      repository.updateQuiz(
        owner.courseId,
        other.topicId,
        randomUUID(),
        owner.teacherId,
        { title: "Must not be updated" },
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("updates only quizzes in the owned Draft course", async () => {
    const fixture = await createTeacherFixture();
    const created = await repository.createQuiz(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      { title: "Original title", description: "Original description" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.updateQuiz(
        fixture.courseId,
        fixture.topicId,
        created.quiz.id,
        fixture.teacherId,
        { title: "Updated title", description: null },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      quiz: {
        title: "Updated title",
        description: null,
        position: 1,
      },
    });

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );

    await expect(
      repository.updateQuiz(
        fixture.courseId,
        fixture.topicId,
        created.quiz.id,
        fixture.teacherId,
        { title: "Must remain unchanged" },
      ),
    ).resolves.toEqual({ kind: "not_editable" });

    await expect(
      repository.getQuizById(
        fixture.courseId,
        fixture.topicId,
        created.quiz.id,
        fixture.teacherId,
      ),
    ).resolves.toMatchObject({ title: "Updated title" });
  });

  it("rolls back quiz creation when its caller transaction aborts", async () => {
    const fixture = await createTeacherFixture();

    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizRepository(transaction).createQuiz(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title: "Rolled back quiz" },
        );
        expect(result.kind).toBe("created");
        throw new Error("force outer transaction rollback");
      }),
    ).rejects.toThrow("force outer transaction rollback");

    await expect(
      repository.listTopicQuizzes(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
      ),
    ).resolves.toEqual([]);
  });

  it("rejects quiz creation after a concurrent Draft-to-review transition", async () => {
    const fixture = await createTeacherFixture();
    const transitionClient = await pool.connect();
    let transactionOpen = false;

    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );

      const createPromise = repository.createQuiz(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        { title: "Must not be created" },
      );

      await waitForCourseLock();
      await transitionClient.query(
        "UPDATE courses SET status = 'pending_review' WHERE id = $1",
        [fixture.courseId],
      );
      await transitionClient.query("COMMIT");
      transactionOpen = false;

      await expect(createPromise).resolves.toEqual({ kind: "not_editable" });
      await expect(
        repository.listTopicQuizzes(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
        ),
      ).resolves.toEqual([]);
    } finally {
      if (transactionOpen) await transitionClient.query("ROLLBACK");
      transitionClient.release();
    }
  });

  it("reorders the complete quiz set, rejects incomplete orders, and rolls back atomically", async () => {
    const fixture = await createTeacherFixture();
    const otherFixture = await createTeacherFixture();
    const foreignQuiz = await repository.createQuiz(
      otherFixture.courseId,
      otherFixture.topicId,
      otherFixture.teacherId,
      { title: "Other topic quiz" },
    );
    expect(foreignQuiz.kind).toBe("created");
    if (foreignQuiz.kind !== "created") return;

    const created = await Promise.all(
      ["First", "Second", "Third"].map((title) =>
        repository.createQuiz(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title },
        ),
      ),
    );
    const ids = created.flatMap((result) =>
      result.kind === "created" ? [result.quiz.id] : [],
    );
    expect(ids).toHaveLength(3);

    const reordered = await repository.reorderTopicQuizzes(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      [...ids].reverse(),
    );
    expect(reordered.kind).toBe("reordered");
    if (reordered.kind !== "reordered") return;
    expect(reordered.quizzes.map(({ id }) => id)).toEqual([...ids].reverse());
    expect(reordered.quizzes.map(({ position }) => position)).toEqual([
      1, 2, 3,
    ]);

    await expect(
      repository.reorderTopicQuizzes(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        ids.slice(1),
      ),
    ).resolves.toEqual({ kind: "invalid_order" });

    await expect(
      repository.reorderTopicQuizzes(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [...ids.slice(1), foreignQuiz.quiz.id],
      ),
    ).resolves.toEqual({ kind: "invalid_order" });

    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizRepository(
          transaction,
        ).reorderTopicQuizzes(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          ids,
        );
        expect(result.kind).toBe("reordered");
        throw new Error("rollback quiz order");
      }),
    ).rejects.toThrow("rollback quiz order");
    const afterRollback = await repository.listTopicQuizzes(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );
    expect(afterRollback.map(({ id }) => id)).toEqual([...ids].reverse());
  });

  it("serializes concurrent quiz reorders and rejects non-owner or non-Draft access", async () => {
    const owner = await createTeacherFixture();
    const other = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        repository.createQuiz(owner.courseId, owner.topicId, owner.teacherId, {
          title,
        }),
      ),
    );
    const ids = created.flatMap((result) =>
      result.kind === "created" ? [result.quiz.id] : [],
    );
    const competing = await Promise.all([
      repository.reorderTopicQuizzes(
        owner.courseId,
        owner.topicId,
        owner.teacherId,
        ids,
      ),
      repository.reorderTopicQuizzes(
        owner.courseId,
        owner.topicId,
        owner.teacherId,
        [...ids].reverse(),
      ),
    ]);
    expect(competing.every((result) => result.kind === "reordered")).toBe(true);
    const final = await repository.listTopicQuizzes(
      owner.courseId,
      owner.topicId,
      owner.teacherId,
    );
    expect(final.map(({ position }) => position)).toEqual([1, 2]);
    expect(new Set(final.map(({ id }) => id))).toEqual(new Set(ids));

    await expect(
      repository.reorderTopicQuizzes(
        owner.courseId,
        owner.topicId,
        other.teacherId,
        ids,
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [owner.courseId],
    );
    await expect(
      repository.reorderTopicQuizzes(
        owner.courseId,
        owner.topicId,
        owner.teacherId,
        ids,
      ),
    ).resolves.toEqual({ kind: "not_editable" });
  });

  it("rechecks course status after waiting for a concurrent status update", async () => {
    const fixture = await createTeacherFixture();
    const quiz = await repository.createQuiz(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      { title: "Status race quiz" },
    );
    expect(quiz.kind).toBe("created");
    if (quiz.kind !== "created") return;

    const transitionClient = await pool.connect();
    let transactionOpen = false;
    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );
      const reorder = repository.reorderTopicQuizzes(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [quiz.quiz.id],
      );
      await waitForCourseLock();
      await transitionClient.query(
        "UPDATE courses SET status = 'pending_review' WHERE id = $1",
        [fixture.courseId],
      );
      await transitionClient.query("COMMIT");
      transactionOpen = false;
      await expect(reorder).resolves.toEqual({ kind: "not_editable" });
    } finally {
      if (transactionOpen) await transitionClient.query("ROLLBACK");
      transitionClient.release();
    }
  });
});
