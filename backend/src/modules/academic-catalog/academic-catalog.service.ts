import {
  academicLevelListResponseSchema,
  subjectListResponseSchema,
  type AcademicLevelListResponse,
  type AcademicLevelResponse,
  type SubjectListResponse,
  type SubjectResponse,
} from "@edutrack/contracts";

export interface AcademicCatalogRepository {
  listAcademicLevels(): Promise<AcademicLevelResponse[]>;
  listSubjects(): Promise<SubjectResponse[]>;
}

export interface AcademicCatalogServiceDependencies {
  repository: AcademicCatalogRepository;
}

export function createAcademicCatalogService({
  repository,
}: AcademicCatalogServiceDependencies) {
  return {
    async listAcademicLevels(): Promise<AcademicLevelListResponse> {
      const items = await repository.listAcademicLevels();

      return academicLevelListResponseSchema.parse({ items });
    },

    async listSubjects(): Promise<SubjectListResponse> {
      const items = await repository.listSubjects();

      return subjectListResponseSchema.parse({ items });
    },
  };
}
