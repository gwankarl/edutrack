import { asc } from "drizzle-orm";

import type {
  AcademicLevelResponse,
  SubjectResponse,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { academicLevels } from "../../infrastructure/database/schema/academic-levels.js";
import { subjects } from "../../infrastructure/database/schema/subjects.js";

export function createAcademicCatalogRepository(database: Database) {
  return {
    async listAcademicLevels(): Promise<AcademicLevelResponse[]> {
      return database
        .select({
          id: academicLevels.id,
          code: academicLevels.code,
          name: academicLevels.name,
          educationStage: academicLevels.stage,
          sortOrder: academicLevels.sortOrder,
        })
        .from(academicLevels)
        .orderBy(asc(academicLevels.sortOrder));
    },

    async listSubjects(): Promise<SubjectResponse[]> {
      return database
        .select({
          id: subjects.id,
          code: subjects.code,
          name: subjects.name,
          sortOrder: subjects.sortOrder,
        })
        .from(subjects)
        .orderBy(asc(subjects.name), asc(subjects.code));
    },
  };
}
