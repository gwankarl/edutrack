import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../config/env.js";
import { createDatabase } from "../client.js";
import { createDatabasePool } from "../pool.js";
import { seedAcademicCatalog } from "./academic-catalog.seed.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const canonicalLevelCodes = [
  "form-1",
  "form-2",
  "form-3",
  "form-4",
  "form-5",
  "lower-sixth",
  "upper-sixth",
];
const canonicalSubjectCodes = ["mathematics", "physics"];
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const unrelatedLevelCode = `seed-test-${suffix}`;
const unrelatedSubjectCode = `seed-test-${suffix}`;
let levelCodesCreatedByTest: string[] = [];
let subjectCodesCreatedByTest: string[] = [];

describe("academic catalog seed", () => {
  beforeAll(async () => {
    const databaseResult = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (databaseResult.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Academic catalog seed tests may only write to edutrack_test.",
      );
    }

    const existingLevels = await pool.query<{ code: string }>(
      "SELECT code FROM academic_levels WHERE code = ANY($1::text[])",
      [canonicalLevelCodes],
    );
    const existingSubjects = await pool.query<{ code: string }>(
      "SELECT code FROM subjects WHERE code = ANY($1::text[])",
      [canonicalSubjectCodes],
    );

    const existingLevelCodes = new Set(
      existingLevels.rows.map(({ code }) => code),
    );
    const existingSubjectCodes = new Set(
      existingSubjects.rows.map(({ code }) => code),
    );

    levelCodesCreatedByTest = canonicalLevelCodes.filter(
      (code) => !existingLevelCodes.has(code),
    );
    subjectCodesCreatedByTest = canonicalSubjectCodes.filter(
      (code) => !existingSubjectCodes.has(code),
    );
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM academic_levels AS level
       WHERE level.code = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM courses WHERE courses.academic_level_id = level.id
         )`,
      [[...levelCodesCreatedByTest, unrelatedLevelCode]],
    );
    await pool.query(
      `DELETE FROM subjects AS subject
       WHERE subject.code = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM courses WHERE courses.subject_id = subject.id
         )`,
      [[...subjectCodesCreatedByTest, unrelatedSubjectCode]],
    );
    await pool.end();
  });

  it("seeds the canonical catalog idempotently without overwriting other records", async () => {
    await pool.query(
      `INSERT INTO academic_levels (code, name, stage, sort_order)
       VALUES ($1, 'Synthetic Unrelated Level', 'upper_secondary', 30000)`,
      [unrelatedLevelCode],
    );
    await pool.query(
      `INSERT INTO subjects (code, name, sort_order)
       VALUES ($1, 'Synthetic Unrelated Subject', 30000)`,
      [unrelatedSubjectCode],
    );

    const unrelatedBefore = await pool.query({
      text: `SELECT id, code, name, stage, sort_order, created_at, updated_at
             FROM academic_levels WHERE code = $1`,
      values: [unrelatedLevelCode],
    });
    const unrelatedSubjectBefore = await pool.query({
      text: `SELECT id, code, name, sort_order, created_at, updated_at
             FROM subjects WHERE code = $1`,
      values: [unrelatedSubjectCode],
    });

    await seedAcademicCatalog(database);
    const firstSeed = await pool.query(
      `SELECT id, code, name, stage, sort_order
       FROM academic_levels
       WHERE code = ANY($1::text[])
       ORDER BY sort_order`,
      [canonicalLevelCodes],
    );
    const firstSubjectSeed = await pool.query(
      `SELECT id, code, name, sort_order
       FROM subjects
       WHERE code = ANY($1::text[])
       ORDER BY name, code`,
      [canonicalSubjectCodes],
    );

    await seedAcademicCatalog(database);
    const secondSeed = await pool.query(
      `SELECT id, code, name, stage, sort_order
       FROM academic_levels
       WHERE code = ANY($1::text[])
       ORDER BY sort_order`,
      [canonicalLevelCodes],
    );
    const secondSubjectSeed = await pool.query(
      `SELECT id, code, name, sort_order
       FROM subjects
       WHERE code = ANY($1::text[])
       ORDER BY name, code`,
      [canonicalSubjectCodes],
    );
    const unrelatedAfter = await pool.query({
      text: `SELECT id, code, name, stage, sort_order, created_at, updated_at
             FROM academic_levels WHERE code = $1`,
      values: [unrelatedLevelCode],
    });
    const unrelatedSubjectAfter = await pool.query({
      text: `SELECT id, code, name, sort_order, created_at, updated_at
             FROM subjects WHERE code = $1`,
      values: [unrelatedSubjectCode],
    });

    expect(firstSeed.rows).toMatchObject([
      {
        code: "form-1",
        name: "Form 1",
        stage: "lower_secondary",
        sort_order: 1,
      },
      {
        code: "form-2",
        name: "Form 2",
        stage: "lower_secondary",
        sort_order: 2,
      },
      {
        code: "form-3",
        name: "Form 3",
        stage: "lower_secondary",
        sort_order: 3,
      },
      {
        code: "form-4",
        name: "Form 4",
        stage: "lower_secondary",
        sort_order: 4,
      },
      {
        code: "form-5",
        name: "Form 5",
        stage: "lower_secondary",
        sort_order: 5,
      },
      {
        code: "lower-sixth",
        name: "Lower Sixth",
        stage: "upper_secondary",
        sort_order: 6,
      },
      {
        code: "upper-sixth",
        name: "Upper Sixth",
        stage: "upper_secondary",
        sort_order: 7,
      },
    ]);
    expect(firstSeed.rows).toHaveLength(7);
    expect(secondSeed.rows).toEqual(firstSeed.rows);
    expect(firstSubjectSeed.rows).toMatchObject([
      { code: "mathematics", name: "Mathematics" },
      { code: "physics", name: "Physics" },
    ]);
    expect(firstSubjectSeed.rows).toHaveLength(2);
    expect(secondSubjectSeed.rows).toEqual(firstSubjectSeed.rows);
    expect(unrelatedAfter.rows).toEqual(unrelatedBefore.rows);
    expect(unrelatedSubjectAfter.rows).toEqual(unrelatedSubjectBefore.rows);
  });
});
