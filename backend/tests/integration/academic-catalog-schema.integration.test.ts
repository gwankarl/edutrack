import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../src/infrastructure/config/env.js";
import { createDatabasePool } from "../../src/infrastructure/database/pool.js";

const pool = createDatabasePool(loadEnvironment());

interface CatalogFixture {
  userId: string;
  teacherProfileId: string;
  academicLevelId: string;
  subjectId: string;
}

function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function uniqueSortOrder(): number {
  return 15_000 + Math.floor(Math.random() * 1_000);
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

async function createCatalogFixture(): Promise<CatalogFixture> {
  const email = `catalog-${randomUUID()}@example.test`;
  let userId: string | undefined;
  let academicLevelId: string | undefined;
  let subjectId: string | undefined;

  try {
    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, "synthetic-catalog-test-hash", "Catalog Test Teacher"],
    );
    userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO role_assignments (user_id, role)
       VALUES ($1, 'teacher')`,
      [userId],
    );

    const profileResult = await pool.query<{ id: string }>(
      `INSERT INTO teacher_profiles (user_id, display_name)
       VALUES ($1, $2)
       RETURNING id`,
      [userId, "Catalog Test Teacher"],
    );

    const levelResult = await pool.query<{ id: string }>(
      `INSERT INTO academic_levels (code, name, stage, sort_order)
       VALUES ($1, $2, 'lower_secondary', $3)
       RETURNING id`,
      [uniqueCode("test-level"), "Synthetic Form 3", uniqueSortOrder()],
    );
    academicLevelId = levelResult.rows[0].id;

    const subjectResult = await pool.query<{ id: string }>(
      `INSERT INTO subjects (code, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [uniqueCode("test-subject"), "Synthetic Mathematics", uniqueSortOrder()],
    );
    subjectId = subjectResult.rows[0].id;

    return {
      userId,
      teacherProfileId: profileResult.rows[0].id,
      academicLevelId,
      subjectId,
    };
  } catch (error) {
    if (userId) await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    if (academicLevelId) {
      await pool.query("DELETE FROM academic_levels WHERE id = $1", [
        academicLevelId,
      ]);
    }
    if (subjectId) {
      await pool.query("DELETE FROM subjects WHERE id = $1", [subjectId]);
    }
    throw error;
  }
}

async function cleanupCatalogFixture(fixture: CatalogFixture): Promise<void> {
  await pool.query(
    `DELETE FROM courses
     WHERE academic_level_id = $1 OR subject_id = $2 OR teacher_id = $3`,
    [fixture.academicLevelId, fixture.subjectId, fixture.teacherProfileId],
  );
  await pool.query("DELETE FROM users WHERE id = $1", [fixture.userId]);
  await pool.query("DELETE FROM academic_levels WHERE id = $1", [
    fixture.academicLevelId,
  ]);
  await pool.query("DELETE FROM subjects WHERE id = $1", [fixture.subjectId]);
}

async function createCourse(
  fixture: CatalogFixture,
  title = "Synthetic catalog course",
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      title,
      fixture.academicLevelId,
      fixture.subjectId,
      fixture.teacherProfileId,
    ],
  );

  return result.rows[0].id;
}

describe("academic catalog database schemas", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Academic catalog tests may only write to edutrack_test.",
      );
    }

    // Remove only marked fixtures left behind if an earlier test process was
    // interrupted between setup and its normal finally cleanup.
    await pool.query(
      `DELETE FROM users
       WHERE email LIKE 'catalog-%@example.test'
         AND password_hash = $1
         AND display_name = $2`,
      ["synthetic-catalog-test-hash", "Catalog Test Teacher"],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("preserves the existing identity and teacher tables and relationships", async () => {
    const tables = [
      "users",
      "role_assignments",
      "auth_sessions",
      "verification_tokens",
      "teacher_applications",
      "teacher_profiles",
      "academic_levels",
      "subjects",
      "courses",
      "topics",
      "lessons",
      "quizzes",
      "quiz_questions",
      "quiz_options",
    ];
    const result = await pool.query<{ table_name: string; exists: boolean }>(
      `SELECT expected.table_name,
              to_regclass('public.' || expected.table_name) IS NOT NULL AS exists
       FROM unnest($1::text[]) AS expected(table_name)
       ORDER BY expected.table_name`,
      [tables],
    );

    expect(result.rows).toHaveLength(tables.length);
    expect(result.rows.every((row) => row.exists)).toBe(true);

    const relationship = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(constraint_row.oid) AS definition
       FROM pg_constraint AS constraint_row
       JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
       WHERE table_row.relname = 'role_assignments'
         AND constraint_row.contype = 'f'`,
    );

    expect(relationship.rows).toHaveLength(1);
    expect(relationship.rows[0].definition).toContain("REFERENCES users(id)");
  });

  it("accepts all seven academic levels with the expected stage and ordering", async () => {
    const codePrefix = uniqueCode("level");
    const orderStart = uniqueSortOrder();
    const levels = [
      { name: "Form 1", stage: "lower_secondary" },
      { name: "Form 2", stage: "lower_secondary" },
      { name: "Form 3", stage: "lower_secondary" },
      { name: "Form 4", stage: "lower_secondary" },
      { name: "Form 5", stage: "lower_secondary" },
      { name: "Lower Sixth", stage: "upper_secondary" },
      { name: "Upper Sixth", stage: "upper_secondary" },
    ] as const;

    try {
      for (const [index, level] of levels.entries()) {
        await pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [
            `${codePrefix}-${index + 1}`,
            level.name,
            level.stage,
            orderStart + index,
          ],
        );
      }

      const result = await pool.query<{
        name: string;
        stage: string;
        sort_order: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT name, stage, sort_order, created_at, updated_at
         FROM academic_levels
         WHERE code LIKE $1
         ORDER BY sort_order`,
        [`${codePrefix}-%`],
      );

      expect(result.rows).toHaveLength(levels.length);
      result.rows.forEach((row, index) => {
        expect(row).toMatchObject({
          ...levels[index],
          sort_order: orderStart + index,
        });
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
      });
    } finally {
      await pool.query("DELETE FROM academic_levels WHERE code LIKE $1", [
        `${codePrefix}-%`,
      ]);
    }
  });

  it("enforces unique academic-level and subject codes and catalog ordering", async () => {
    const levelCode = uniqueCode("unique-level");
    const levelOrder = uniqueSortOrder();
    const subjectCode = uniqueCode("unique-subject");

    try {
      await pool.query(
        `INSERT INTO academic_levels (code, name, stage, sort_order)
         VALUES ($1, $2, 'lower_secondary', $3)`,
        [levelCode, "Synthetic Unique Level", levelOrder],
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, 'upper_secondary', $3)`,
          [levelCode, "Duplicate Code Level", levelOrder + 1],
        ),
        "23505",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, 'lower_secondary', $3)`,
          [uniqueCode("duplicate-order"), "Duplicate Order Level", levelOrder],
        ),
        "23505",
      );

      await pool.query(
        `INSERT INTO subjects (code, name, sort_order)
         VALUES ($1, $2, 1)`,
        [subjectCode, "Synthetic Unique Subject"],
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO subjects (code, name, sort_order)
           VALUES ($1, $2, 2)`,
          [subjectCode, "Duplicate Code Subject"],
        ),
        "23505",
      );
    } finally {
      await pool.query("DELETE FROM academic_levels WHERE code = $1", [
        levelCode,
      ]);
      await pool.query("DELETE FROM subjects WHERE code = $1", [subjectCode]);
    }
  });

  it("applies defaults and timestamps and allows multiple courses for one level and subject", async () => {
    const fixture = await createCatalogFixture();

    try {
      const catalogDefaults = await pool.query<{
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT created_at, updated_at
         FROM academic_levels WHERE id = $1
         UNION ALL
         SELECT created_at, updated_at FROM subjects WHERE id = $2`,
        [fixture.academicLevelId, fixture.subjectId],
      );
      expect(catalogDefaults).toMatchObject({ rowCount: 2 });
      for (const row of catalogDefaults.rows) {
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
      }

      const firstCourseId = await createCourse(fixture, "Synthetic Course A");
      const secondCourseId = await createCourse(fixture, "Synthetic Course B");
      const result = await pool.query<{
        id: string;
        status: string;
        created_at: Date;
        updated_at: Date;
        academic_level_id: string;
        subject_id: string;
        teacher_id: string;
      }>(
        `SELECT id, status, created_at, updated_at,
                academic_level_id, subject_id, teacher_id
         FROM courses
         WHERE id = ANY($1::uuid[])
         ORDER BY id`,
        [[firstCourseId, secondCourseId]],
      );

      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) {
        expect(row.status).toBe("draft");
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
        expect(row.academic_level_id).toBe(fixture.academicLevelId);
        expect(row.subject_id).toBe(fixture.subjectId);
        expect(row.teacher_id).toBe(fixture.teacherProfileId);
      }
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });

  it("creates incomplete draft lessons, quizzes, and questions with timestamp defaults", async () => {
    const fixture = await createCatalogFixture();

    try {
      const courseId = await createCourse(fixture);
      const topicResult = await pool.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO topics (course_id, title, position)
         VALUES ($1, $2, 1)
         RETURNING id, created_at, updated_at`,
        [courseId, "Synthetic Topic"],
      );
      const topicId = topicResult.rows[0].id;
      expect(topicResult.rows[0].created_at).toBeInstanceOf(Date);
      expect(topicResult.rows[0].updated_at).toBeInstanceOf(Date);

      const lesson = await pool.query<{
        content: unknown;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO lessons (topic_id, title, position)
         VALUES ($1, $2, 1)
         RETURNING content, created_at, updated_at`,
        [topicId, "Synthetic Lesson"],
      );
      expect(lesson.rows[0].content).toBeNull();
      expect(lesson.rows[0].created_at).toBeInstanceOf(Date);
      expect(lesson.rows[0].updated_at).toBeInstanceOf(Date);

      const quiz = await pool.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO quizzes (topic_id, title, position)
         VALUES ($1, $2, 1)
         RETURNING id, created_at, updated_at`,
        [topicId, "Synthetic Draft Quiz"],
      );
      expect(quiz.rows[0].created_at).toBeInstanceOf(Date);
      expect(quiz.rows[0].updated_at).toBeInstanceOf(Date);

      const question = await pool.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO quiz_questions (quiz_id, question_text, position)
         VALUES ($1, $2, 1)
         RETURNING id, created_at, updated_at`,
        [quiz.rows[0].id, "Synthetic draft question"],
      );
      expect(question.rows[0].created_at).toBeInstanceOf(Date);
      expect(question.rows[0].updated_at).toBeInstanceOf(Date);

      const options = await pool.query<{ option_count: string }>(
        `SELECT count(*)::text AS option_count
         FROM quiz_options
         WHERE question_id = $1`,
        [question.rows[0].id],
      );
      expect(options.rows[0].option_count).toBe("0");
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });

  it("enforces foreign keys for courses and every content child table", async () => {
    const fixture = await createCatalogFixture();
    const missingId = randomUUID();

    try {
      await expectSqlState(
        pool.query(
          `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
           VALUES ($1, $2, $3, $4)`,
          [
            "Invalid level course",
            missingId,
            fixture.subjectId,
            fixture.teacherProfileId,
          ],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
           VALUES ($1, $2, $3, $4)`,
          [
            "Invalid subject course",
            fixture.academicLevelId,
            missingId,
            fixture.teacherProfileId,
          ],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
           VALUES ($1, $2, $3, $4)`,
          [
            "Invalid teacher course",
            fixture.academicLevelId,
            fixture.subjectId,
            missingId,
          ],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO topics (course_id, title, position) VALUES ($1, $2, 1)`,
          [missingId, "Invalid topic"],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO lessons (topic_id, title, position) VALUES ($1, $2, 1)`,
          [missingId, "Invalid lesson"],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quizzes (topic_id, title, position) VALUES ($1, $2, 1)`,
          [missingId, "Invalid quiz"],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1)`,
          [missingId, "Invalid question"],
        ),
        "23503",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, option_text, position)
           VALUES ($1, $2, 1)`,
          [missingId, "Invalid option"],
        ),
        "23503",
      );
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });

  it("enforces required fields, meaningful text, valid stages, and positive positions", async () => {
    const fixture = await createCatalogFixture();

    try {
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, stage, sort_order)
           VALUES ($1, 'lower_secondary', $2)`,
          [uniqueCode("missing-level-name"), uniqueSortOrder()],
        ),
        "23502",
      );
      await expectSqlState(
        pool.query(`INSERT INTO subjects (code, sort_order) VALUES ($1, 1)`, [
          uniqueCode("missing-subject-name"),
        ]),
        "23502",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [
            uniqueCode("invalid-stage"),
            "Invalid Stage",
            "middle",
            uniqueSortOrder(),
          ],
        ),
        "22P02",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, 'lower_secondary', $3)`,
          [uniqueCode("Uppercase"), "Invalid Code", uniqueSortOrder()],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO academic_levels (code, name, stage, sort_order)
           VALUES ($1, $2, 'lower_secondary', $3)`,
          [uniqueCode("blank-level"), "   ", uniqueSortOrder()],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO subjects (code, name, sort_order)
           VALUES ($1, $2, 1)`,
          [uniqueCode("blank-subject"), "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO courses (title, academic_level_id, subject_id, teacher_id)
           VALUES ($1, $2, $3, $4)`,
          [
            "   ",
            fixture.academicLevelId,
            fixture.subjectId,
            fixture.teacherProfileId,
          ],
        ),
        "23514",
      );

      const courseId = await createCourse(fixture);
      await expectSqlState(
        pool.query(
          `INSERT INTO courses (academic_level_id, subject_id, teacher_id)
           VALUES ($1, $2, $3)`,
          [
            fixture.academicLevelId,
            fixture.subjectId,
            fixture.teacherProfileId,
          ],
        ),
        "23502",
      );
      const topicId = (
        await pool.query<{ id: string }>(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [courseId, "Validation Topic"],
        )
      ).rows[0].id;

      await expectSqlState(
        pool.query(`INSERT INTO topics (course_id, position) VALUES ($1, 2)`, [
          courseId,
        ]),
        "23502",
      );
      await expectSqlState(
        pool.query(`INSERT INTO lessons (topic_id, position) VALUES ($1, 2)`, [
          topicId,
        ]),
        "23502",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 0)`,
          [courseId, "Invalid position topic"],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1)`,
          [courseId, "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO lessons (topic_id, title, position)
           VALUES ($1, $2, 0)`,
          [topicId, "Invalid lesson position"],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO lessons (topic_id, title, position)
           VALUES ($1, $2, 1)`,
          [topicId, "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO lessons (topic_id, title, content, position)
           VALUES ($1, $2, $3::jsonb, 1)`,
          [topicId, "Array lesson content", JSON.stringify([])],
        ),
        "23514",
      );

      const quizId = (
        await pool.query<{ id: string }>(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [topicId, "Validation Quiz"],
        )
      ).rows[0].id;
      await expectSqlState(
        pool.query(`INSERT INTO quizzes (topic_id, position) VALUES ($1, 2)`, [
          topicId,
        ]),
        "23502",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 0)`,
          [topicId, "Invalid quiz position"],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 2)`,
          [topicId, "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query("UPDATE courses SET status = 'archived' WHERE id = $1", [
          courseId,
        ]),
        "22P02",
      );

      const questionId = (
        await pool.query<{ id: string }>(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [quizId, "Validation Question"],
        )
      ).rows[0].id;
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_questions (quiz_id, position) VALUES ($1, 2)`,
          [quizId],
        ),
        "23502",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 0)`,
          [quizId, "Invalid question position"],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 2)`,
          [quizId, "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, option_text, position)
           VALUES ($1, $2, 0)`,
          [questionId, "Invalid option position"],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, option_text, position)
           VALUES ($1, $2, 1)`,
          [questionId, "   "],
        ),
        "23514",
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, position)
           VALUES ($1, 2)`,
          [questionId],
        ),
        "23502",
      );
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });

  it("enforces per-parent ordering and allows positions to repeat under other parents", async () => {
    const fixture = await createCatalogFixture();

    try {
      const courseOne = await createCourse(fixture, "Ordering Course One");
      const courseTwo = await createCourse(fixture, "Ordering Course Two");
      const topicOne = (
        await pool.query<{ id: string }>(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [courseOne, "Topic One"],
        )
      ).rows[0].id;
      const topicTwo = (
        await pool.query<{ id: string }>(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [courseTwo, "Topic One"],
        )
      ).rows[0].id;

      await expectSqlState(
        pool.query(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1)`,
          [courseOne, "Duplicate topic position"],
        ),
        "23505",
      );

      const lessonOne = await pool.query(
        `INSERT INTO lessons (topic_id, title, position)
         VALUES ($1, $2, 1)`,
        [topicOne, "Lesson One"],
      );
      expect(lessonOne.rowCount).toBe(1);
      await pool.query(
        `INSERT INTO lessons (topic_id, title, position)
         VALUES ($1, $2, 1)`,
        [topicTwo, "Lesson One"],
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO lessons (topic_id, title, position)
           VALUES ($1, $2, 1)`,
          [topicOne, "Duplicate lesson position"],
        ),
        "23505",
      );

      const quizOne = (
        await pool.query<{ id: string }>(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [topicOne, "Quiz One"],
        )
      ).rows[0].id;
      const quizTwo = (
        await pool.query<{ id: string }>(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [topicTwo, "Quiz One"],
        )
      ).rows[0].id;
      await expectSqlState(
        pool.query(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 1)`,
          [topicOne, "Duplicate quiz position"],
        ),
        "23505",
      );

      const questionOne = (
        await pool.query<{ id: string }>(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [quizOne, "Question One"],
        )
      ).rows[0].id;
      const questionTwo = (
        await pool.query<{ id: string }>(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [quizTwo, "Question One"],
        )
      ).rows[0].id;
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1)`,
          [quizOne, "Duplicate question position"],
        ),
        "23505",
      );

      await pool.query(
        `INSERT INTO quiz_options (question_id, option_text, position)
         VALUES ($1, $2, 1)`,
        [questionOne, "Option One"],
      );
      await pool.query(
        `INSERT INTO quiz_options (question_id, option_text, position)
         VALUES ($1, $2, 1)`,
        [questionTwo, "Option One"],
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, option_text, position)
           VALUES ($1, $2, 1)`,
          [questionOne, "Duplicate option position"],
        ),
        "23505",
      );
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });

  it("allows zero or one correct draft option and prevents a second correct option", async () => {
    const fixture = await createCatalogFixture();

    try {
      const courseId = await createCourse(fixture);
      const topicId = (
        await pool.query<{ id: string }>(
          `INSERT INTO topics (course_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [courseId, "Quiz Topic"],
        )
      ).rows[0].id;
      const quizId = (
        await pool.query<{ id: string }>(
          `INSERT INTO quizzes (topic_id, title, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [topicId, "Incomplete Quiz"],
        )
      ).rows[0].id;
      const questionId = (
        await pool.query<{ id: string }>(
          `INSERT INTO quiz_questions (quiz_id, question_text, position)
           VALUES ($1, $2, 1) RETURNING id`,
          [quizId, "Incomplete question"],
        )
      ).rows[0].id;

      const first = await pool.query<{ is_correct: boolean }>(
        `INSERT INTO quiz_options (question_id, option_text, position)
         VALUES ($1, $2, 1) RETURNING is_correct`,
        [questionId, "Synthetic incorrect answer"],
      );
      expect(first.rows[0].is_correct).toBe(false);

      await pool.query(
        `INSERT INTO quiz_options (question_id, option_text, position, is_correct)
         VALUES ($1, $2, 2, true)`,
        [questionId, "Synthetic correct answer"],
      );
      await expectSqlState(
        pool.query(
          `INSERT INTO quiz_options (question_id, option_text, position, is_correct)
           VALUES ($1, $2, 3, true)`,
          [questionId, "Another correct answer"],
        ),
        "23505",
      );
    } finally {
      await cleanupCatalogFixture(fixture);
    }
  });
});
