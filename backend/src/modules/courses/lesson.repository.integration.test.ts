import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createLessonRepository } from "./lesson.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createLessonRepository(database);

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
      `lesson-repository-${suffix}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Synthetic Lesson Teacher",
    ],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new Error("Test user insert did not return an ID.");
  createdUserIds.push(userId);

  const profileResult = await pool.query<{ id: string }>(
    `INSERT INTO teacher_profiles (user_id, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, "Synthetic Lesson Teacher"],
  );
  const teacherId = profileResult.rows[0]?.id;
  if (!teacherId) throw new Error("Test profile insert did not return an ID.");

  const levelResult = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3)
     RETURNING id`,
    [`lesson-test-${suffix}`, `Synthetic Form ${suffix}`, sortOrder],
  );
  const academicLevelId = levelResult.rows[0]?.id;
  if (!academicLevelId)
    throw new Error("Test level insert did not return an ID.");
  createdAcademicLevelIds.push(academicLevelId);

  const subjectResult = await pool.query<{ id: string }>(
    `INSERT INTO subjects (code, name, sort_order)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`lesson-test-${suffix}`, `Synthetic Subject ${suffix}`, sortOrder],
  );
  const subjectId = subjectResult.rows[0]?.id;
  if (!subjectId) throw new Error("Test subject insert did not return an ID.");
  createdSubjectIds.push(subjectId);

  const courseResult = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ["Synthetic lesson test course", academicLevelId, subjectId, teacherId],
  );
  const courseId = courseResult.rows[0]?.id;
  if (!courseId) throw new Error("Test course insert did not return an ID.");
  createdCourseIds.push(courseId);

  const topicResult = await pool.query<{ id: string }>(
    `INSERT INTO topics (course_id, title, position)
     VALUES ($1, $2, 1)
     RETURNING id`,
    [courseId, "Synthetic lesson test topic"],
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

  throw new Error("Timed out waiting for the lesson mutation course lock.");
}

describe("lesson repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Lesson repository tests may only write to edutrack_test.",
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

  it("creates incomplete lessons with server-assigned concurrent positions", async () => {
    const fixture = await createTeacherFixture();

    const [first, second] = await Promise.all([
      repository.createLesson(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        { title: "First lesson" },
      ),
      repository.createLesson(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        {
          title: "Second lesson",
          content: {
            blocks: [{ type: "paragraph", text: "Synthetic content" }],
          },
        },
      ),
    ]);

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");

    const lessons = await repository.listTopicLessons(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );

    expect(lessons.map(({ position }) => position)).toEqual([1, 2]);
    expect(lessons.map(({ title }) => title)).toEqual(
      expect.arrayContaining(["First lesson", "Second lesson"]),
    );
    expect(lessons.find(({ title }) => title === "First lesson")).toMatchObject(
      {
        topicId: fixture.topicId,
        content: null,
      },
    );
    expect(
      lessons.find(({ title }) => title === "Second lesson"),
    ).toMatchObject({
      content: { blocks: [{ type: "paragraph", text: "Synthetic content" }] },
    });
    expect(lessons[0]?.createdAt).toEqual(expect.any(String));
    expect(lessons[0]?.updatedAt).toEqual(expect.any(String));
  });

  it("rolls back lesson creation when its caller transaction aborts", async () => {
    const fixture = await createTeacherFixture();

    await expect(
      database.transaction(async (transaction) => {
        const result = await createLessonRepository(transaction).createLesson(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title: "Rolled back lesson" },
        );
        expect(result.kind).toBe("created");
        throw new Error("force outer transaction rollback");
      }),
    ).rejects.toThrow("force outer transaction rollback");

    await expect(
      repository.listTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
      ),
    ).resolves.toEqual([]);
  });

  it("retrieves only lessons in the requested owned course and topic", async () => {
    const owner = await createTeacherFixture();
    const otherTeacher = await createTeacherFixture();

    const created = await repository.createLesson(
      owner.courseId,
      owner.topicId,
      owner.teacherId,
      { title: "Owned lesson" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.getLessonById(
        owner.courseId,
        owner.topicId,
        created.lesson.id,
        owner.teacherId,
      ),
    ).resolves.toMatchObject({ id: created.lesson.id });

    await expect(
      repository.getLessonById(
        owner.courseId,
        owner.topicId,
        created.lesson.id,
        otherTeacher.teacherId,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.getLessonById(
        owner.courseId,
        randomUUID(),
        created.lesson.id,
        owner.teacherId,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.listTopicLessons(
        owner.courseId,
        randomUUID(),
        owner.teacherId,
      ),
    ).resolves.toEqual([]);
  });

  it("updates owned Draft lessons and rejects changes after submission", async () => {
    const fixture = await createTeacherFixture();
    const created = await repository.createLesson(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      { title: "Original lesson" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.updateLesson(
        fixture.courseId,
        fixture.topicId,
        created.lesson.id,
        fixture.teacherId,
        { title: "Updated lesson", content: { blocks: [] } },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      lesson: {
        title: "Updated lesson",
        content: { blocks: [] },
        position: 1,
      },
    });

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );

    await expect(
      repository.updateLesson(
        fixture.courseId,
        fixture.topicId,
        created.lesson.id,
        fixture.teacherId,
        { title: "Must remain unchanged" },
      ),
    ).resolves.toEqual({ kind: "not_editable" });

    await expect(
      repository.getLessonById(
        fixture.courseId,
        fixture.topicId,
        created.lesson.id,
        fixture.teacherId,
      ),
    ).resolves.toMatchObject({ title: "Updated lesson" });
  });

  it("does not update a lesson if the course leaves Draft while the request waits", async () => {
    const fixture = await createTeacherFixture();
    const created = await repository.createLesson(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      { title: "Concurrent lesson" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    const transitionClient = await pool.connect();
    let transactionOpen = false;

    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );

      const updatePromise = repository.updateLesson(
        fixture.courseId,
        fixture.topicId,
        created.lesson.id,
        fixture.teacherId,
        { title: "Must not be applied" },
      );

      await waitForCourseLock();
      await transitionClient.query(
        "UPDATE courses SET status = 'pending_review' WHERE id = $1",
        [fixture.courseId],
      );
      await transitionClient.query("COMMIT");
      transactionOpen = false;

      await expect(updatePromise).resolves.toEqual({ kind: "not_editable" });
      await expect(
        repository.getLessonById(
          fixture.courseId,
          fixture.topicId,
          created.lesson.id,
          fixture.teacherId,
        ),
      ).resolves.toMatchObject({ title: "Concurrent lesson" });
    } finally {
      if (transactionOpen) {
        await transitionClient.query("ROLLBACK");
      }
      transitionClient.release();
    }
  });

  it("rejects creation and updates when the topic is not in the requested course", async () => {
    const fixture = await createTeacherFixture();
    const unrelatedTopicId = randomUUID();

    await expect(
      repository.createLesson(
        fixture.courseId,
        unrelatedTopicId,
        fixture.teacherId,
        { title: "Must not be created" },
      ),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(
      repository.updateLesson(
        fixture.courseId,
        unrelatedTopicId,
        randomUUID(),
        fixture.teacherId,
        { title: "Must not be updated" },
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("reorders all lessons and rejects incomplete or cross-topic IDs", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second", "Third"].map((title) =>
        repository.createLesson(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title },
        ),
      ),
    );
    const ids = created.map((result) => {
      expect(result.kind).toBe("created");
      return result.kind === "created" ? result.lesson.id : "";
    });

    const reordered = await repository.reorderTopicLessons(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
      [ids[2]!, ids[0]!, ids[1]!],
    );
    expect(reordered.kind).toBe("reordered");
    if (reordered.kind === "reordered") {
      expect(reordered.lessons.map(({ id }) => id)).toEqual([
        ids[2],
        ids[0],
        ids[1],
      ]);
      expect(reordered.lessons.map(({ position }) => position)).toEqual([
        1, 2, 3,
      ]);
    }

    expect(
      await repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [ids[0]!],
      ),
    ).toEqual({ kind: "invalid_order" });

    const otherTopic = await pool.query<{ id: string }>(
      "INSERT INTO topics (course_id, title, position) VALUES ($1, $2, 2) RETURNING id",
      [fixture.courseId, "Another topic"],
    );
    const foreignTopicId = otherTopic.rows[0]?.id;
    if (!foreignTopicId) throw new Error("Test topic insert returned no ID.");
    const foreignLesson = await pool.query<{ id: string }>(
      "INSERT INTO lessons (topic_id, title, position) VALUES ($1, $2, 1) RETURNING id",
      [foreignTopicId, "Foreign lesson"],
    );
    const foreignLessonId = foreignLesson.rows[0]?.id;
    if (!foreignLessonId) throw new Error("Test lesson insert returned no ID.");

    expect(
      await repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [ids[0]!, ids[1]!, foreignLessonId],
      ),
    ).toEqual({ kind: "invalid_order" });
  });

  it("rolls back reordered lesson positions when its caller transaction aborts", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        repository.createLesson(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title },
        ),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.lesson.id : "",
    );
    const before = await repository.listTopicLessons(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );

    await expect(
      database.transaction(async (transaction) => {
        const result = await createLessonRepository(
          transaction,
        ).reorderTopicLessons(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          [...ids].reverse(),
        );
        expect(result.kind).toBe("reordered");
        throw new Error("force outer transaction rollback");
      }),
    ).rejects.toThrow("force outer transaction rollback");

    await expect(
      repository.listTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
      ),
    ).resolves.toEqual(before);
  });

  it("serializes concurrent lesson reorders and rejects reordering after Draft", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second", "Third"].map((title) =>
        repository.createLesson(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title },
        ),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.lesson.id : "",
    );

    const results = await Promise.all([
      repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [ids[2]!, ids[1]!, ids[0]!],
      ),
      repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [ids[1]!, ids[0]!, ids[2]!],
      ),
    ]);
    expect(results.every((result) => result.kind === "reordered")).toBe(true);
    const finalLessons = await repository.listTopicLessons(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );
    expect(finalLessons.map(({ position }) => position)).toEqual([1, 2, 3]);
    expect(new Set(finalLessons.map(({ id }) => id))).toEqual(new Set(ids));

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );
    await expect(
      repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        ids,
      ),
    ).resolves.toEqual({ kind: "not_editable" });
  });

  it("does not apply a lesson reorder after a concurrent Draft transition", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        repository.createLesson(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
          { title },
        ),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.lesson.id : "",
    );
    const before = await repository.listTopicLessons(
      fixture.courseId,
      fixture.topicId,
      fixture.teacherId,
    );
    const transitionClient = await pool.connect();
    let transactionOpen = false;

    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );
      const reorderPromise = repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [...ids].reverse(),
      );
      await waitForCourseLock();
      await transitionClient.query(
        "UPDATE courses SET status = 'pending_review' WHERE id = $1",
        [fixture.courseId],
      );
      await transitionClient.query("COMMIT");
      transactionOpen = false;

      await expect(reorderPromise).resolves.toEqual({ kind: "not_editable" });
      await expect(
        repository.listTopicLessons(
          fixture.courseId,
          fixture.topicId,
          fixture.teacherId,
        ),
      ).resolves.toEqual(before);
    } finally {
      if (transactionOpen) await transitionClient.query("ROLLBACK");
      transitionClient.release();
    }
  });

  it("accepts an empty lesson order only when the topic has no lessons", async () => {
    const fixture = await createTeacherFixture();
    await expect(
      repository.reorderTopicLessons(
        fixture.courseId,
        fixture.topicId,
        fixture.teacherId,
        [],
      ),
    ).resolves.toEqual({ kind: "reordered", lessons: [] });
  });
});
