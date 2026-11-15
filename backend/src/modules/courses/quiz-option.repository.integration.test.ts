import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createQuizOptionRepository } from "./quiz-option.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createQuizOptionRepository(database);

const createdCourseIds: string[] = [];
const createdUserIds: string[] = [];
const createdAcademicLevelIds: string[] = [];
const createdSubjectIds: string[] = [];

function suffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function createQuestionFixture() {
  const unique = suffix();
  const sortOrder = 10_000 + Math.floor(Math.random() * 20_000);
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [
      `quiz-option-${unique}@example.test`,
      "$argon2id$synthetic-test",
      "Option Test",
    ],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error("Could not create test user.");
  createdUserIds.push(userId);

  const profile = await pool.query<{ id: string }>(
    `INSERT INTO teacher_profiles (user_id, display_name)
     VALUES ($1, $2) RETURNING id`,
    [userId, "Option Test Teacher"],
  );
  const teacherId = profile.rows[0]?.id;
  if (!teacherId) throw new Error("Could not create test teacher profile.");

  const level = await pool.query<{ id: string }>(
    `INSERT INTO academic_levels (code, name, stage, sort_order)
     VALUES ($1, $2, 'lower_secondary', $3) RETURNING id`,
    [`option-test-${unique}`, `Option Test ${unique}`, sortOrder],
  );
  const academicLevelId = level.rows[0]?.id;
  if (!academicLevelId) throw new Error("Could not create test level.");
  createdAcademicLevelIds.push(academicLevelId);

  const subject = await pool.query<{ id: string }>(
    `INSERT INTO subjects (code, name, sort_order)
     VALUES ($1, $2, $3) RETURNING id`,
    [`option-test-${unique}`, `Option Subject ${unique}`, sortOrder],
  );
  const subjectId = subject.rows[0]?.id;
  if (!subjectId) throw new Error("Could not create test subject.");
  createdSubjectIds.push(subjectId);

  const course = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ["Synthetic option test course", academicLevelId, subjectId, teacherId],
  );
  const courseId = course.rows[0]?.id;
  if (!courseId) throw new Error("Could not create test course.");
  createdCourseIds.push(courseId);

  const topic = await pool.query<{ id: string }>(
    `INSERT INTO topics (course_id, title, position)
     VALUES ($1, $2, 1) RETURNING id`,
    [courseId, "Synthetic option topic"],
  );
  const topicId = topic.rows[0]?.id;
  if (!topicId) throw new Error("Could not create test topic.");

  const quiz = await pool.query<{ id: string }>(
    `INSERT INTO quizzes (topic_id, title, position)
     VALUES ($1, $2, 1) RETURNING id`,
    [topicId, "Synthetic option quiz"],
  );
  const quizId = quiz.rows[0]?.id;
  if (!quizId) throw new Error("Could not create test quiz.");

  const question = await pool.query<{ id: string }>(
    `INSERT INTO quiz_questions (quiz_id, question_text, position)
     VALUES ($1, $2, 1) RETURNING id`,
    [quizId, "Synthetic option question"],
  );
  const questionId = question.rows[0]?.id;
  if (!questionId) throw new Error("Could not create test question.");

  return { courseId, questionId, teacherId };
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
  throw new Error("Timed out waiting for the option reorder course lock.");
}

describe("quiz option repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Quiz option repository tests may only write to edutrack_test.",
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

  it("assigns sequential positions concurrently and retrieves options in order", async () => {
    const fixture = await createQuestionFixture();
    const results = await Promise.all([
      repository.createOption(fixture.questionId, fixture.teacherId, {
        optionText: "First",
      }),
      repository.createOption(fixture.questionId, fixture.teacherId, {
        optionText: "Second",
        isCorrect: true,
      }),
    ]);

    expect(results.map((result) => result.kind)).toEqual([
      "created",
      "created",
    ]);
    const options = await repository.listQuestionOptions(
      fixture.questionId,
      fixture.teacherId,
    );
    expect(options.map((option) => option.position)).toEqual([1, 2]);
    expect(options.map((option) => option.optionText)).toEqual(
      expect.arrayContaining(["First", "Second"]),
    );
    expect(options.find((option) => option.isCorrect)?.optionText).toBe(
      "Second",
    );
  });

  it("scopes reads and updates to the owning teacher and question", async () => {
    const owner = await createQuestionFixture();
    const other = await createQuestionFixture();
    const created = await repository.createOption(
      owner.questionId,
      owner.teacherId,
      { optionText: "Owner option" },
    );
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;

    await expect(
      repository.getOptionById(
        owner.questionId,
        created.option.id,
        other.teacherId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.getOptionById(
        other.questionId,
        created.option.id,
        owner.teacherId,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.updateOption(
        other.questionId,
        created.option.id,
        owner.teacherId,
        { optionText: "Wrong parent" },
      ),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      repository.updateOption(
        owner.questionId,
        created.option.id,
        owner.teacherId,
        { optionText: "Updated option", isCorrect: true },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      option: { optionText: "Updated option", position: 1, isCorrect: true },
    });
  });

  it("changes the correct answer atomically without violating the unique index", async () => {
    const fixture = await createQuestionFixture();
    const first = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      {
        optionText: "First",
        isCorrect: true,
      },
    );
    const second = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      {
        optionText: "Second",
      },
    );
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    if (first.kind !== "created" || second.kind !== "created") return;

    await expect(
      repository.setCorrectOption(
        fixture.questionId,
        second.option.id,
        fixture.teacherId,
        {
          isCorrect: true,
        },
      ),
    ).resolves.toMatchObject({
      kind: "updated",
      option: { id: second.option.id, isCorrect: true },
    });

    const options = await repository.listQuestionOptions(
      fixture.questionId,
      fixture.teacherId,
    );
    expect(
      options.filter((candidate) => candidate.isCorrect).map(({ id }) => id),
    ).toEqual([second.option.id]);
  });

  it("rejects a second correct option, blocks non-Draft mutations, and rolls back", async () => {
    const fixture = await createQuestionFixture();
    const correct = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      { optionText: "Correct", isCorrect: true },
    );
    expect(correct.kind).toBe("created");
    const secondCorrect = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      { optionText: "Another correct", isCorrect: true },
    );
    expect(secondCorrect).toEqual({
      kind: "conflict",
      reason: "correct_answer",
    });

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );
    await expect(
      repository.createOption(fixture.questionId, fixture.teacherId, {
        optionText: "Blocked",
      }),
    ).resolves.toEqual({ kind: "not_editable" });

    await pool.query("UPDATE courses SET status = 'draft' WHERE id = $1", [
      fixture.courseId,
    ]);
    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizOptionRepository(
          transaction,
        ).createOption(fixture.questionId, fixture.teacherId, {
          optionText: "Rolled back",
        });
        expect(result.kind).toBe("created");
        throw new Error("rollback fixture transaction");
      }),
    ).rejects.toThrow("rollback fixture transaction");

    const options = await repository.listQuestionOptions(
      fixture.questionId,
      fixture.teacherId,
    );
    expect(options.map((option) => option.optionText)).not.toContain(
      "Rolled back",
    );
  });

  it("reorders a complete option set without changing text or correctness", async () => {
    const fixture = await createQuestionFixture();
    const otherFixture = await createQuestionFixture();
    const otherOption = await repository.createOption(
      otherFixture.questionId,
      otherFixture.teacherId,
      { optionText: "Other parent" },
    );
    const first = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      {
        optionText: "Correct answer",
        isCorrect: true,
      },
    );
    const second = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      {
        optionText: "Distractor",
      },
    );
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    if (first.kind !== "created" || second.kind !== "created") return;

    const reordered = await repository.reorderQuestionOptions(
      fixture.questionId,
      fixture.teacherId,
      [second.option.id, first.option.id],
    );
    expect(reordered.kind).toBe("reordered");
    if (reordered.kind !== "reordered") return;
    expect(
      reordered.options.map(({ optionText, position, isCorrect }) => ({
        optionText,
        position,
        isCorrect,
      })),
    ).toEqual([
      { optionText: "Distractor", position: 1, isCorrect: false },
      { optionText: "Correct answer", position: 2, isCorrect: true },
    ]);
    await expect(
      repository.reorderQuestionOptions(fixture.questionId, fixture.teacherId, [
        first.option.id,
      ]),
    ).resolves.toEqual({ kind: "invalid_order" });
    expect(otherOption.kind).toBe("created");
    if (otherOption.kind === "created") {
      await expect(
        repository.reorderQuestionOptions(
          fixture.questionId,
          fixture.teacherId,
          [first.option.id, otherOption.option.id],
        ),
      ).resolves.toEqual({ kind: "invalid_order" });
    }
  });

  it("serializes option reorder, enforces ownership and Draft state, and rolls back", async () => {
    const fixture = await createQuestionFixture();
    const created = await Promise.all(
      ["Option one", "Option two"].map((optionText) =>
        repository.createOption(fixture.questionId, fixture.teacherId, {
          optionText,
        }),
      ),
    );
    const ids = created.flatMap((result) =>
      result.kind === "created" ? [result.option.id] : [],
    );
    await Promise.all([
      repository.reorderQuestionOptions(
        fixture.questionId,
        fixture.teacherId,
        ids,
      ),
      repository.reorderQuestionOptions(
        fixture.questionId,
        fixture.teacherId,
        [...ids].reverse(),
      ),
    ]);
    const current = await repository.listQuestionOptions(
      fixture.questionId,
      fixture.teacherId,
    );
    expect(current.map(({ position }) => position)).toEqual([1, 2]);

    await expect(
      database.transaction(async (transaction) => {
        const result = await createQuizOptionRepository(
          transaction,
        ).reorderQuestionOptions(fixture.questionId, fixture.teacherId, ids);
        expect(result.kind).toBe("reordered");
        throw new Error("rollback option order");
      }),
    ).rejects.toThrow("rollback option order");
    await expect(
      repository.listQuestionOptions(fixture.questionId, fixture.teacherId),
    ).resolves.toMatchObject(
      current.map(({ id, position }) => ({ id, position })),
    );

    await pool.query(
      "UPDATE courses SET status = 'pending_review' WHERE id = $1",
      [fixture.courseId],
    );
    await expect(
      repository.reorderQuestionOptions(
        fixture.questionId,
        fixture.teacherId,
        ids,
      ),
    ).resolves.toEqual({ kind: "not_editable" });
  });

  it("rejects an option reorder waiting behind a course status transition", async () => {
    const fixture = await createQuestionFixture();
    const option = await repository.createOption(
      fixture.questionId,
      fixture.teacherId,
      {
        optionText: "Status race option",
      },
    );
    expect(option.kind).toBe("created");
    if (option.kind !== "created") return;

    const transitionClient = await pool.connect();
    let transactionOpen = false;
    try {
      await transitionClient.query("BEGIN");
      transactionOpen = true;
      await transitionClient.query(
        "SELECT id FROM courses WHERE id = $1 FOR UPDATE",
        [fixture.courseId],
      );
      const reorder = repository.reorderQuestionOptions(
        fixture.questionId,
        fixture.teacherId,
        [option.option.id],
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
