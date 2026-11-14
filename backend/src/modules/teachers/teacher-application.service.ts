import {
  getMyTeacherApplicationResponseSchema,
  submitTeacherApplicationRequestSchema,
  teacherApplicationResponseSchema,
  type TeacherApplicationResponse,
} from "@edutrack/contracts";

import type { IdentityCurrentUserRecord } from "../identity/identity.repository.js";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  PendingTeacherApplicationExistsError,
  type CreateTeacherApplicationInput,
  type TeacherApplicationRecord,
} from "./teacher-application.repository.js";

export interface TeacherApplicationRepository {
  createApplication(
    input: CreateTeacherApplicationInput,
  ): Promise<TeacherApplicationRecord>;
  findLatestByUserId(userId: string): Promise<TeacherApplicationRecord | null>;
  hasPendingApplication(userId: string): Promise<boolean>;
}

export interface TeacherApplicationIdentityRepository {
  findCurrentUserById(
    userId: string,
  ): Promise<IdentityCurrentUserRecord | null>;
  findRolesByUserId(userId: string): Promise<UserRole[]>;
}

export interface TeacherApplicationServiceDependencies {
  repository: TeacherApplicationRepository;
  identityRepository: TeacherApplicationIdentityRepository;
}

export class TeacherApplicationNotEligibleError extends Error {
  constructor() {
    super("This account is not eligible to submit a teacher application.");
    this.name = "TeacherApplicationNotEligibleError";
  }
}

export class TeacherRoleAlreadyAssignedError extends Error {
  constructor() {
    super("This account already has the Teacher role.");
    this.name = "TeacherRoleAlreadyAssignedError";
  }
}

export class TeacherApplicationAlreadyApprovedError extends Error {
  constructor() {
    super("An approved teacher application already exists.");
    this.name = "TeacherApplicationAlreadyApprovedError";
  }
}

function toPublicResponse(
  application: TeacherApplicationRecord,
): TeacherApplicationResponse {
  const sharedFields = {
    id: application.id,
    motivation: application.motivation,
    qualifications: application.qualifications,
    submittedAt: application.submittedAt.toISOString(),
  };

  switch (application.status) {
    case "pending":
      return teacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "pending",
        reviewedAt: null,
        rejectionReason: null,
      });

    case "approved":
      return teacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "approved",
        reviewedAt: application.reviewedAt?.toISOString(),
        rejectionReason: null,
      });

    case "rejected":
      return teacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "rejected",
        reviewedAt: application.reviewedAt?.toISOString(),
        rejectionReason: application.rejectionReason,
      });
  }
}

export function createTeacherApplicationService({
  repository,
  identityRepository,
}: TeacherApplicationServiceDependencies) {
  return {
    async submitApplication(
      userId: string,
      input: unknown,
    ): Promise<TeacherApplicationResponse> {
      const request = submitTeacherApplicationRequestSchema.parse(input);
      const user = await identityRepository.findCurrentUserById(userId);

      if (
        !user ||
        user.accountStatus !== "active" ||
        user.emailVerifiedAt === null
      ) {
        throw new TeacherApplicationNotEligibleError();
      }

      const roles = await identityRepository.findRolesByUserId(userId);

      if (roles.includes("teacher")) {
        throw new TeacherRoleAlreadyAssignedError();
      }

      if (await repository.hasPendingApplication(userId)) {
        throw new PendingTeacherApplicationExistsError();
      }

      const latestApplication = await repository.findLatestByUserId(userId);

      if (latestApplication?.status === "pending") {
        throw new PendingTeacherApplicationExistsError();
      }

      if (latestApplication?.status === "approved") {
        throw new TeacherApplicationAlreadyApprovedError();
      }

      // The repository translates the partial-index race into the same typed
      // pending-application error used by the pre-check above.
      const application = await repository.createApplication({
        userId,
        motivation: request.motivation,
        qualifications: request.qualifications,
      });

      return toPublicResponse(application);
    },

    async getMyApplication(userId: string) {
      const application = await repository.findLatestByUserId(userId);

      return getMyTeacherApplicationResponseSchema.parse({
        application: application ? toPublicResponse(application) : null,
      });
    },
  };
}
