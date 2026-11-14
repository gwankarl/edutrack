import {
  adminTeacherApplicationListQuerySchema,
  adminTeacherApplicationListResponseSchema,
  adminTeacherApplicationParamsSchema,
  adminTeacherApplicationResponseSchema,
  type AdminTeacherApplicationListQuery,
  type AdminTeacherApplicationListResponse,
  type AdminTeacherApplicationResponse,
} from "@edutrack/contracts";

export interface TeacherApplicationReviewRepository {
  listApplications(
    query: AdminTeacherApplicationListQuery,
  ): Promise<AdminTeacherApplicationListResponse>;
  findById(
    applicationId: string,
  ): Promise<AdminTeacherApplicationResponse | null>;
}

export interface TeacherApplicationReviewServiceDependencies {
  repository: TeacherApplicationReviewRepository;
}

export class TeacherApplicationNotFoundError extends Error {
  constructor() {
    super("Teacher application was not found.");
    this.name = "TeacherApplicationNotFoundError";
  }
}

export function createTeacherApplicationReviewService({
  repository,
}: TeacherApplicationReviewServiceDependencies) {
  return {
    async listApplications(
      filters: unknown = {},
    ): Promise<AdminTeacherApplicationListResponse> {
      const query = adminTeacherApplicationListQuerySchema.parse(filters);
      const result = await repository.listApplications(query);

      return adminTeacherApplicationListResponseSchema.parse(result);
    },

    async getApplicationById(
      applicationId: unknown,
    ): Promise<AdminTeacherApplicationResponse> {
      const { applicationId: validatedId } =
        adminTeacherApplicationParamsSchema.parse({ applicationId });

      const application = await repository.findById(validatedId);

      if (!application) {
        throw new TeacherApplicationNotFoundError();
      }

      return adminTeacherApplicationResponseSchema.parse(application);
    },
  };
}
