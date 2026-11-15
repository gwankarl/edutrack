import { inArray } from "drizzle-orm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvironment } from "../../config/env.js";
import { academicLevels } from "../schema/academic-levels.js";
import type { NewAcademicLevel } from "../schema/academic-levels.js";
import { subjects } from "../schema/subjects.js";
import type { NewSubject } from "../schema/subjects.js";
import { createDatabase } from "../client.js";
import { createDatabasePool } from "../pool.js";

const academicLevelSeedData = [
  {
    code: "form-1",
    name: "Form 1",
    stage: "lower_secondary",
    sortOrder: 1,
  },
  {
    code: "form-2",
    name: "Form 2",
    stage: "lower_secondary",
    sortOrder: 2,
  },
  {
    code: "form-3",
    name: "Form 3",
    stage: "lower_secondary",
    sortOrder: 3,
  },
  {
    code: "form-4",
    name: "Form 4",
    stage: "lower_secondary",
    sortOrder: 4,
  },
  {
    code: "form-5",
    name: "Form 5",
    stage: "lower_secondary",
    sortOrder: 5,
  },
  {
    code: "lower-sixth",
    name: "Lower Sixth",
    stage: "upper_secondary",
    sortOrder: 6,
  },
  {
    code: "upper-sixth",
    name: "Upper Sixth",
    stage: "upper_secondary",
    sortOrder: 7,
  },
] satisfies NewAcademicLevel[];

const subjectSeedData = [
  {
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  {
    code: "physics",
    name: "Physics",
    sortOrder: 2,
  },
] satisfies NewSubject[];

export async function seedAcademicCatalog(
  database: ReturnType<typeof createDatabase>,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .insert(academicLevels)
      .values(academicLevelSeedData)
      .onConflictDoNothing({ target: academicLevels.code });

    await transaction
      .insert(subjects)
      .values(subjectSeedData)
      .onConflictDoNothing({ target: subjects.code });

    const storedLevels = await transaction
      .select({
        code: academicLevels.code,
        name: academicLevels.name,
        stage: academicLevels.stage,
        sortOrder: academicLevels.sortOrder,
      })
      .from(academicLevels)
      .where(
        inArray(
          academicLevels.code,
          academicLevelSeedData.map((level) => level.code),
        ),
      );

    const levelsMatch =
      storedLevels.length === academicLevelSeedData.length &&
      academicLevelSeedData.every((expected) =>
        storedLevels.some(
          (stored) =>
            stored.code === expected.code &&
            stored.name === expected.name &&
            stored.stage === expected.stage &&
            stored.sortOrder === expected.sortOrder,
        ),
      );

    if (!levelsMatch) {
      throw new Error(
        "Existing academic-level codes conflict with the expected catalog seed.",
      );
    }

    const storedSubjects = await transaction
      .select({
        code: subjects.code,
        name: subjects.name,
        sortOrder: subjects.sortOrder,
      })
      .from(subjects)
      .where(
        inArray(
          subjects.code,
          subjectSeedData.map((subject) => subject.code),
        ),
      );

    const subjectsMatch =
      storedSubjects.length === subjectSeedData.length &&
      subjectSeedData.every((expected) =>
        storedSubjects.some(
          (stored) =>
            stored.code === expected.code &&
            stored.name === expected.name &&
            stored.sortOrder === expected.sortOrder,
        ),
      );

    if (!subjectsMatch) {
      throw new Error(
        "Existing subject codes conflict with the expected catalog seed.",
      );
    }
  });
}

async function main(): Promise<void> {
  const environment = loadEnvironment();

  if (environment.NODE_ENV !== "development") {
    throw new Error(
      "The academic catalog seed is allowed only in development.",
    );
  }

  const configuredDatabase = decodeURIComponent(
    new URL(environment.DATABASE_URL).pathname.replace(/^\/+/, ""),
  );

  if (configuredDatabase !== "edutrack_dev") {
    throw new Error(
      "The academic catalog seed requires DATABASE_URL to target edutrack_dev.",
    );
  }

  const pool = createDatabasePool(environment);

  try {
    const result = await pool.query<{ databaseName: string }>(
      'SELECT current_database() AS "databaseName"',
    );

    if (result.rows[0]?.databaseName !== "edutrack_dev") {
      throw new Error(
        "The connected database is not edutrack_dev; seed was not run.",
      );
    }

    await seedAcademicCatalog(createDatabase(pool));

    console.info("Academic catalog seed verified: 7 levels and 2 subjects.");
  } finally {
    await pool.end();
  }
}

const isExecutedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  await main();
}
