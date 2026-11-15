import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createQuizQuestionRepository } from "./quiz-question.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createQuizQuestionRepository(database);

const createdCourseIds: string[] = [];
const createdUserIds: string[] = [];
const createdAcademicLevelIds: string[] = [];
const createdSubjectIds: string[] = [];

function suffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function createQuizFixture() {
  const unique = suffix();
  const sortOrder = 10_000 + Math.floor(Math.random() * 20_000);
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [
      `quiz-question-${unique}@example.test`,
      "$argon2id$synthetic-test",
      "Question Test",
    ],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Could not create test user.");
  createdUserIds.push(userId);

  const profile = await pool.query<{ id: string }>(
    `INSERT INTO teacher_profiles (user_id, display_name)
     VALUES ($1, $2) RETURNING id`,
    [userId, "Question Test Teacher"],
  );
  const teacherId = profile.rows[0]?.id;
  if (!teacherId) throw new Error("Could not create test teacher profile.");

  const level = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3) RETURNING id`,
    [`question-test-${unique}`, `Question Test ${unique}`, sortOrder],
  );
  const academicLevelId = level.rows[0]?.id;
  if (!academicLevelId) throw new Error("Could not create test level.");
  createdAcademicLevelIds.push(academicLevelId);

  const subject = await pool.query<{ id: string }>(
    `INSERT INTO subjects (code, name, sort_order)
     VALUES ($1, $2, $3) RETURNING id`,
    [`question-test-${unique}`, `Question Subject ${unique}`, sortOrder],
  );
  const subjectId = subject.rows[0]?.id;
  if (!subjectId) throw new Error("Could not create test subject.");
  createdSubjectIds.push(subjectId);

  const course = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ["Synthetic question test course", academicLevelId, subjectId, teacherId],
  );
  const courseId = course.rows[0]?.id;
  if (!courseId) throw new Error("Could not create test course.");
  createdCourseIds.push(courseId);

  const topic = await pool.query<{ id: string }>(
    `INSERT INTO topics (course_id, title, position)
     VALUES ($1, $2, 1) RETURNING id`,
    [courseId, "Synthetic question topic"],
  );
  const topicId = topic.rows[0]?.id;
  if (!topicId) throw new Error("Could not create test topic.");

  const quiz = await pool.query<{ id: string }>(
    `INSERT INTO quizzes (topic_id, title, position)
     VALUES ($1, $2, 1) RETURNING id`,
    [topicId, "Synthetic question quiz"],
  );
  const quizId = quiz.rows[0]?.id;
  if (!quizId) throw new Error("Could not create test quiz.");

  return { courseId, quizId, teacherId };
}

async function waitForCourseLock(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database() AND pid <> pg_backend_pid()
           AND wait_event_type = 'Lock'
           AND query ILIKE '%from "courses"%for update%'
       ) AS waiting`,
    );
    if (result.rows[0]?.waiting) return;
    await delay(10);
  }
  throw new Error("Timed out waiting for the question reorder course lock.");
}

describe("quiz question repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Quiz question repository tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (createdCourseIds.length) {
      await pool.query("DELETE FROM courses WHERE id = ANY($1::uuid[])", [
        createdCourseIds.splice(0),
      ]);
    }
    if (createdUserIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        createdUserIds.splice(0),
      ]);
    }
    if (createdAcademicLevelIds.length) {
      await pool.query(
        "DELETE FROM academic_levels WHERE id = ANY($1::uuid[])",
        [createdAcademicLevelIds.splice(0)],
      );
    }
    if (createdSubjectIds.length) {
      await pool.query("DELETE FROM subjects WHERE id = ANY($1::uuid[])", [
        createdSubjectIds.splice(0),
      ]);
    }
  });

  afterAll(async () => pool.end());

  it("creates Draft questions with server-assigned ordering and empty options", async () => {
    const fixture = await createQuizFixture();
    const results = await Promise.all([
      repository.createQuestion(fixture.quizId, fixture.teacherId, {
        questionText: "First question",
      }),
      repository.createQuestion(fixture.quizId, fixture.teacherId, {
        questionText: "Second question",
      }),
    ]);

    expect(results.map((result) => result.kind)).toEqual([
      "created",
      "created",
    ]);
    const listed = await repository.listQuizQuestions(
      fixture.quizId,
      fixture.teacherId,
    );
    expect(listed.items.map((item) => item.position)).toEqual([1, 2]);
    expect(listed.items.map((item) => item.questionText)).toEqual(
      expect.arrayContaining(["First question", "Second question"]),
    );
    expect(listed.items.every((item) => item.options.length === 0)).toBe(true);
    expect(listed.items[0]?.createdAt).toEqual(expect.any(String));
    expect(listed.items[0]?.updatedAt).toEqual(expect.any(String));
  });

  it("checks quiz ownership even when a quiz has no questions", async () => {
    const owner = await createQuizFixture();
    const other = await createQuizFixture();

    await expect(
      repository.quizExistsForTeacher(owner.quizId, owner.teacherId),
    ).resolves.toBe(true);
    await expect(
      repository.quizExistsForTeacher(owner.quizId, other.teacherId),
    ).resolves.toBe(false);
  });

  it("scopes retrieval and updates to the quiz and owning teacher", async () => {
    const owner = await createQuizFixture();
    const other = await createQuizFixture();
    const created = await repository.createQuestion(
      owner.quizId,
      owner.teacherId,
      {
        questionText: "Original question",
      },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.getQuestionById(
        owner.quizId,
        created.question.id,
        other.teacherId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.getQuestionById(
        other.quizId,
        created.question.id,
        owner.teacherId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.updateQuestion(
        other.quizId,
        created.question.id,
        owner.teacherId,
        { questionText: "Wrong parent" },
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      repository.updateQuestion(
        owner.quizId,
        created.question.id,
        owner.teacherId,
        { questionText: "Updated question" },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      question: { questionText: "Updated question", position: 1 },
    });
  });

  it("rejects mutations for non-Draft courses and supports caller transaction rollback", async () => {
    const fixture = await createQuizFixture();
    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );
    await expect(
      repository.createQuestion(fixture.quizId, fixture.teacherId, {
        questionText: "Blocked",
      }),
    ).resolves.toEqual({ kind: "not_editable" });

    await pool.query("UPDATE courses SET status = 'draft' WHERE id = $1", [
      fixture.courseId,
    ]);
    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizQuestionRepository(
          transaction,
        ).createQuestion(fixture.quizId, fixture.teacherId, {
          questionText: "Rolled back",
        });
        expect(result.kind).toBe("created");
        throw new Error("rollback fixture transaction");
      }),
    ).rejects.toThrow("rollback fixture transaction");

    await expect(
      repository.listQuizQuestions(fixture.quizId, fixture.teacherId),
    ).resolves.toMatchObject({ items: [] });
  });

  it("reorders all questions sequentially and rejects missing and cross-quiz IDs", async () => {
    const fixture = await createQuizFixture();
    const secondFixture = await createQuizFixture();
    const created = await Promise.all(
      ["First question", "Second question", "Third question"].map(
        (questionText) =>
          repository.createQuestion(fixture.quizId, fixture.teacherId, {
            questionText,
          }),
      ),
    );
    const ids = created.flatMap((result) =>
      result.kind === "created" ? [result.question.id] : [],
    );
    const otherQuestion = await repository.createQuestion(
      secondFixture.quizId,
      secondFixture.teacherId,
      { questionText: "Other quiz question" },
    );
    expect(otherQuestion.kind).toBe("created");
    if (otherQuestion.kind !== "created") return;

    const result = await repository.reorderQuizQuestions(
      fixture.quizId,
      fixture.teacherId,
      [ids[2]!, ids[0]!, ids[1]!],
    );
    expect(result.kind).toBe("reordered");
    if (result.kind !== "reordered") return;
    expect(result.questions.map(({ id }) => id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
    expect(result.questions.map(({ position }) => position)).toEqual([1, 2, 3]);

    await expect(
      repository.reorderQuizQuestions(
        fixture.quizId,
        fixture.teacherId,
        ids.slice(1),
      ),
    ).resolves.toEqual({ kind: "invalid_order" });
    await expect(
      repository.reorderQuizQuestions(fixture.quizId, fixture.teacherId, [
        ...ids.slice(1),
        otherQuestion.question.id,
      ]),
    ).resolves.toEqual({ kind: "invalid_order" });
    await expect(
      repository.reorderQuizQuestions(
        fixture.quizId,
        secondFixture.teacherId,
        ids,
      ),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("serializes concurrent question reorder requests and rolls back failed transactions", async () => {
    const fixture = await createQuizFixture();
    const created = await Promise.all(
      ["Question one", "Question two"].map((questionText) =>
        repository.createQuestion(fixture.quizId, fixture.teacherId, {
          questionText,
        }),
      ),
    );
    const ids = created.flatMap((result) =>
      result.kind === "created" ? [result.question.id] : [],
    );
    await Promise.all([
      repository.reorderQuizQuestions(fixture.quizId, fixture.teacherId, ids),
      repository.reorderQuizQuestions(
        fixture.quizId,
        fixture.teacherId,
        [...ids].reverse(),
      ),
    ]);
    const current = await repository.listQuizQuestions(
      fixture.quizId,
      fixture.teacherId,
    );
    expect(current.items.map(({ position }) => position)).toEqual([1, 2]);

    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizQuestionRepository(
          transaction,
        ).reorderQuizQuestions(fixture.quizId, fixture.teacherId, ids);
        expect(result.kind).toBe("reordered");
        throw new Error("rollback question order");
      }),
    ).rejects.toThrow("rollback question order");
    await expect(
      repository.listQuizQuestions(fixture.quizId, fixture.teacherId),
    ).resolves.toMatchObject({
      items: current.items.map(({ id, position }) => ({ id, position })),
    });
  });

  it("rejects a reorder waiting behind a concurrent Draft-to-review transition", async () => {
    const fixture = await createQuizFixture();
    const question = await repository.createQuestion(
      fixture.quizId,
      fixture.teacherId,
      {
        questionText: "Status race question",
      },
    );
    expect(question.kind).toBe("created");
    if (question.kind !== "created") return;

    const transitionClient = await pool.connect();
    let transactionOpen = false;
    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );
      const reorder = repository.reorderQuizQuestions(
        fixture.quizId,
        fixture.teacherId,
        [question.question.id],
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
