import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createTopicRepository } from "./topic.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createTopicRepository(database);

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
      `topic-repository-${suffix}@example.test`,
      "$argon2id$synthetic-integration-test-hash",
      "Synthetic Topic Teacher",
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
    [userId, "Synthetic Topic Teacher"],
  );
  const teacherId = profileResult.rows[0]?.id;

  if (!teacherId) {
    throw new Error("Test teacher profile insert did not return an ID.");
  }

  const levelResult = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3)
     RETURNING id`,
    [`topic-test-${suffix}`, `Synthetic Form ${suffix}`, sortOrder],
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
    [`topic-test-${suffix}`, `Synthetic Subject ${suffix}`, sortOrder],
  );
  const subjectId = subjectResult.rows[0]?.id;

  if (!subjectId) {
    throw new Error("Test subject insert did not return an ID.");
  }
  createdSubjectIds.push(subjectId);

  const courseResult = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    ["Synthetic topic test course", academicLevelId, subjectId, teacherId],
  );
  const courseId = courseResult.rows[0]?.id;

  if (!courseId) {
    throw new Error("Test course insert did not return an ID.");
  }
  createdCourseIds.push(courseId);

  return { courseId, teacherId };
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

    if (result.rows[0]?.waiting) {
      return;
    }

    await delay(10);
  }

  throw new Error("Timed out waiting for the topic mutation course lock.");
}

describe("topic repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Topic repository tests may only write to edutrack_test.",
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

  it("creates topics with server-assigned sequential positions", async () => {
    const fixture = await createTeacherFixture();

    const [first, second] = await Promise.all([
      repository.createTopic(fixture.courseId, fixture.teacherId, {
        title: "First topic",
      }),
      repository.createTopic(fixture.courseId, fixture.teacherId, {
        title: "Second topic",
        description: "Synthetic description",
      }),
    ]);

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");

    const topics = await repository.listCourseTopics(
      fixture.courseId,
      fixture.teacherId,
    );

    expect(topics.map(({ position }) => position)).toEqual([1, 2]);
    expect(topics.map(({ title }) => title)).toEqual(
      expect.arrayContaining(["First topic", "Second topic"]),
    );
    expect(topics.every(({ courseId }) => courseId === fixture.courseId)).toBe(
      true,
    );
    expect(topics.find(({ title }) => title === "First topic")).toMatchObject({
      description: null,
    });
    expect(topics.find(({ title }) => title === "Second topic")).toMatchObject({
      description: "Synthetic description",
    });
    expect(topics[0]?.createdAt).toEqual(expect.any(String));
    expect(topics[0]?.updatedAt).toEqual(expect.any(String));
  });

  it("rolls back topic creation when its caller transaction aborts", async () => {
    const fixture = await createTeacherFixture();

    await expect(
      database.transaction(async (transaction) => {
        const result = await createTopicRepository(transaction).createTopic(
          fixture.courseId,
          fixture.teacherId,
          { title: "Rolled back topic" },
        );
        expect(result.kind).toBe("created");
        throw new Error("force outer transaction rollback");
      }),
    ).rejects.toThrow("force outer transaction rollback");

    await expect(
      repository.listCourseTopics(fixture.courseId, fixture.teacherId),
    ).resolves.toEqual([]);
  });

  it("scopes listing and retrieval to the owned course", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();

    const created = await repository.createTopic(
      owner.courseId,
      owner.teacherId,
      {
        title: "Owner topic",
      },
    );

    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      return;
    }

    await expect(
      repository.listCourseTopics(owner.courseId, anotherTeacher.teacherId),
    ).resolves.toEqual([]);

    await expect(
      repository.getTopicById(
        owner.courseId,
        created.topic.id,
        anotherTeacher.teacherId,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.getTopicById(
        owner.courseId,
        created.topic.id,
        owner.teacherId,
      ),
    ).resolves.toMatchObject({ id: created.topic.id });
  });

  it("updates only owned Draft topics and hides missing or foreign topics", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();

    const created = await repository.createTopic(
      owner.courseId,
      owner.teacherId,
      {
        title: "Original title",
      },
    );

    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      return;
    }

    await expect(
      repository.updateTopic(
        owner.courseId,
        created.topic.id,
        owner.teacherId,
        { title: "Updated title", description: "Updated description" },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      topic: {
        title: "Updated title",
        description: "Updated description",
        position: 1,
      },
    });

    await expect(
      repository.updateTopic(
        owner.courseId,
        created.topic.id,
        anotherTeacher.teacherId,
        { title: "Foreign update" },
      ),
    ).resolves.toEqual({ kind: "not_found" });

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [owner.courseId],
    );

    await expect(
      repository.updateTopic(
        owner.courseId,
        created.topic.id,
        owner.teacherId,
        { title: "Must remain unchanged" },
      ),
    ).resolves.toEqual({ kind: "not_editable" });

    await expect(
      repository.getTopicById(
        owner.courseId,
        created.topic.id,
        owner.teacherId,
      ),
    ).resolves.toMatchObject({ title: "Updated title" });
  });

  it("rejects a concurrent topic update after the course leaves Draft", async () => {
    const fixture = await createTeacherFixture();
    const created = await repository.createTopic(
      fixture.courseId,
      fixture.teacherId,
      { title: "Concurrent topic" },
    );

    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      return;
    }

    const transitionClient = await pool.connect();
    let transactionOpen = false;

    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );

      const updatePromise = repository.updateTopic(
        fixture.courseId,
        created.topic.id,
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
        repository.getTopicById(
          fixture.courseId,
          created.topic.id,
          fixture.teacherId,
        ),
      ).resolves.toMatchObject({ title: "Concurrent topic" });
    } finally {
      if (transactionOpen) {
        await transitionClient.query("ROLLBACK");
      }
      transitionClient.release();
    }
  });

  it("returns not_found for courses the teacher does not own", async () => {
    const owner = await createTeacherFixture();
    const anotherTeacher = await createTeacherFixture();

    await expect(
      repository.createTopic(owner.courseId, anotherTeacher.teacherId, {
        title: "Must not be created",
      }),
    ).resolves.toEqual({ kind: "not_found" });

    await expect(
      repository.updateTopic(
        owner.courseId,
        randomUUID(),
        anotherTeacher.teacherId,
        { title: "Must not be changed" },
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("reorders all topics atomically through swaps and rejects incomplete or cross-course IDs", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second", "Third"].map((title) =>
        repository.createTopic(fixture.courseId, fixture.teacherId, { title }),
      ),
    );
    const ids = created.map((result) => {
      expect(result.kind).toBe("created");
      return result.kind === "created" ? result.topic.id : "";
    });

    const reordered = await repository.reorderCourseTopics(
      fixture.courseId,
      fixture.teacherId,
      [ids[2]!, ids[0]!, ids[1]!],
    );
    expect(reordered.kind).toBe("reordered");
    if (reordered.kind === "reordered") {
      expect(reordered.topics.map(({ id }) => id)).toEqual([
        ids[2],
        ids[0],
        ids[1],
      ]);
      expect(reordered.topics.map(({ position }) => position)).toEqual([
        1, 2, 3,
      ]);
    }

    expect(
      await repository.reorderCourseTopics(
        fixture.courseId,
        fixture.teacherId,
        [ids[0]!],
      ),
    ).toEqual({ kind: "invalid_order" });

    const anotherCourse = await createTeacherFixture();
    const foreign = await repository.createTopic(
      anotherCourse.courseId,
      anotherCourse.teacherId,
      { title: "Foreign topic" },
    );
    expect(foreign.kind).toBe("created");
    if (foreign.kind === "created") {
      expect(
        await repository.reorderCourseTopics(
          fixture.courseId,
          fixture.teacherId,
          [ids[0]!, ids[1]!, foreign.topic.id],
        ),
      ).toEqual({ kind: "invalid_order" });
    }
  });

  it("rolls back reordered positions when its caller transaction aborts", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        repository.createTopic(fixture.courseId, fixture.teacherId, { title }),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.topic.id : "",
    );
    const before = await repository.listCourseTopics(
      fixture.courseId,
      fixture.teacherId,
    );

    await expect(
      database.transaction(async (transaction) => {
        const result = await createTopicRepository(
          transaction,
        ).reorderCourseTopics(
          fixture.courseId,
          fixture.teacherId,
          [...ids].reverse(),
        );
        expect(result.kind).toBe("reordered");
        throw new Error("force outer transaction rollback");
      }),
    ).rejects.toThrow("force outer transaction rollback");

    await expect(
      repository.listCourseTopics(fixture.courseId, fixture.teacherId),
    ).resolves.toEqual(before);
  });

  it("serializes concurrent reorders and rejects reordering after Draft", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second", "Third"].map((title) =>
        repository.createTopic(fixture.courseId, fixture.teacherId, { title }),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.topic.id : "",
    );

    const results = await Promise.all([
      repository.reorderCourseTopics(fixture.courseId, fixture.teacherId, [
        ids[2]!,
        ids[1]!,
        ids[0]!,
      ]),
      repository.reorderCourseTopics(fixture.courseId, fixture.teacherId, [
        ids[1]!,
        ids[0]!,
        ids[2]!,
      ]),
    ]);
    expect(results.every((result) => result.kind === "reordered")).toBe(true);
    const finalTopics = await repository.listCourseTopics(
      fixture.courseId,
      fixture.teacherId,
    );
    expect(finalTopics.map(({ position }) => position)).toEqual([1, 2, 3]);
    expect(new Set(finalTopics.map(({ id }) => id))).toEqual(new Set(ids));

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );
    await expect(
      repository.reorderCourseTopics(fixture.courseId, fixture.teacherId, ids),
    ).resolves.toEqual({ kind: "not_editable" });
  });

  it("does not apply a reorder after a concurrent Draft-to-review transition", async () => {
    const fixture = await createTeacherFixture();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        repository.createTopic(fixture.courseId, fixture.teacherId, { title }),
      ),
    );
    const ids = created.map((result) =>
      result.kind === "created" ? result.topic.id : "",
    );
    const before = await repository.listCourseTopics(
      fixture.courseId,
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
      const reorderPromise = repository.reorderCourseTopics(
        fixture.courseId,
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
        repository.listCourseTopics(fixture.courseId, fixture.teacherId),
      ).resolves.toEqual(before);
    } finally {
      if (transactionOpen) await transitionClient.query("ROLLBACK");
      transitionClient.release();
    }
  });

  it("accepts an empty order only when the course has no topics", async () => {
    const fixture = await createTeacherFixture();
    await expect(
      repository.reorderCourseTopics(fixture.courseId, fixture.teacherId, []),
    ).resolves.toEqual({ kind: "reordered", topics: [] });
  });
});
