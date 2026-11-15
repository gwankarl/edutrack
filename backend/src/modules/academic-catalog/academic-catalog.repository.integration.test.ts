import { randomUUID } from "node:crypto";

import {
  academicLevelListResponseSchema,
  subjectListResponseSchema,
} from "@edutrack/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createAcademicCatalogRepository } from "./academic-catalog.repository.js";

const pool = createDatabasePool(loadEnvironment());
const repository = createAcademicCatalogRepository(createDatabase(pool));

const createdLevelCodes: string[] = [];
const createdSubjectCodes: string[] = [];

function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

function uniqueLevelSortStart(): number {
  return 20_000 + Math.floor(Math.random() * 5_000);
}

describe("academic catalog repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Academic catalog repository tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (createdLevelCodes.length > 0) {
      await pool.query(
        "DELETE FROM academic_levels WHERE code = ANY($1::text[])",
        [createdLevelCodes.splice(0)],
      );
    }

    if (createdSubjectCodes.length > 0) {
      await pool.query("DELETE FROM subjects WHERE code = ANY($1::text[])", [
        createdSubjectCodes.splice(0),
      ]);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns academic-level contract records ordered by display order", async () => {
    const suffix = uniqueSuffix();
    const firstCode = `repo-level-${suffix}-a`;
    const secondCode = `repo-level-${suffix}-b`;
    const orderStart = uniqueLevelSortStart();

    createdLevelCodes.push(firstCode, secondCode);

    await pool.query(
      `INSERT INTO academic_levels (code, name, stage, sort_order)
       VALUES
         ($1, 'Synthetic Upper Level', 'upper_secondary', $2),
         ($3, 'Synthetic Lower Level', 'lower_secondary', $4)`,
      [firstCode, orderStart + 1, secondCode, orderStart],
    );

    const levels = await repository.listAcademicLevels();
    const firstIndex = levels.findIndex((level) => level.code === secondCode);
    const secondIndex = levels.findIndex((level) => level.code === firstCode);

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);

    expect(levels.find((level) => level.code === firstCode)).toMatchObject({
      code: firstCode,
      name: "Synthetic Upper Level",
      educationStage: "upper_secondary",
      sortOrder: orderStart + 1,
    });

    expect(levels.find((level) => level.code === secondCode)).toMatchObject({
      code: secondCode,
      name: "Synthetic Lower Level",
      educationStage: "lower_secondary",
      sortOrder: orderStart,
    });

    expect(
      academicLevelListResponseSchema.parse({ items: levels }).items,
    ).toEqual(levels);
  });

  it("returns subjects alphabetically by name with code as a stable tie-breaker", async () => {
    const suffix = uniqueSuffix();
    const subjectRows = [
      {
        code: `repo-${suffix}-z`,
        name: `ZZZ Repository Subject ${suffix}`,
        sortOrder: 1,
      },
      {
        code: `repo-${suffix}-a`,
        name: `AAA Repository Subject ${suffix}`,
        sortOrder: 2,
      },
      {
        code: `repo-${suffix}-tie-b`,
        name: `Tie Repository Subject ${suffix}`,
        sortOrder: 3,
      },
      {
        code: `repo-${suffix}-tie-a`,
        name: `Tie Repository Subject ${suffix}`,
        sortOrder: 4,
      },
    ];

    createdSubjectCodes.push(...subjectRows.map((subject) => subject.code));

    for (const subject of subjectRows) {
      await pool.query(
        `INSERT INTO subjects (code, name, sort_order)
         VALUES ($1, $2, $3)`,
        [subject.code, subject.name, subject.sortOrder],
      );
    }

    const subjects = await repository.listSubjects();
    const returnedTestSubjects = subjects
      .filter((subject) => createdSubjectCodes.includes(subject.code))
      .map((subject) => subject.code);

    expect(returnedTestSubjects).toEqual([
      `repo-${suffix}-a`,
      `repo-${suffix}-tie-a`,
      `repo-${suffix}-tie-b`,
      `repo-${suffix}-z`,
    ]);

    expect(
      subjectListResponseSchema.parse({ items: subjects }).items,
    ).toHaveLength(subjects.length);
  });

  it("returns arrays without special handling when catalog rows are absent", async () => {
    const levels = await repository.listAcademicLevels();
    const subjects = await repository.listSubjects();

    expect(Array.isArray(levels)).toBe(true);
    expect(Array.isArray(subjects)).toBe(true);
  });
});
