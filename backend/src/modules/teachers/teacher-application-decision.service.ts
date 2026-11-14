import { ZodError, z } from "zod";

import {
  adminTeacherApplicationDecisionParamsSchema,
  adminTeacherApplicationDecisionResponseSchema,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
  type AdminTeacherApplicationDecisionResponse,
} from "@edutrack/contracts";
import type { TeacherApplication } from "../../infrastructure/database/schema/teacher-applications.js";
import type {
  ApprovePendingApplicationInput,
  CreateTeacherProfileInput,
  RejectPendingApplicationInput,
  TeacherApplicationDecisionUser,
} from "./teacher-application-decision.repository.js";

export interface TeacherApplicationDecisionRepository {
  findApplicationForUpdate(
    applicationId: string,
  ): Promise<TeacherApplication | null>;
  findUserById(userId: string): Promise<TeacherApplicationDecisionUser | null>;
  approvePendingApplication(
    input: ApprovePendingApplicationInput,
  ): Promise<TeacherApplication | null>;
  rejectPendingApplication(
    input: RejectPendingApplicationInput,
  ): Promise<TeacherApplication | null>;
  createTeacherProfile(
    input: CreateTeacherProfileInput,
  ): Promise<{ id: string } | null>;
  grantTeacherRole(userId: string): Promise<"teacher" | null>;
}

export interface TeacherApplicationDecisionServiceDependencies {
  /**
   * The implementation must create one database transaction and construct
   * the supplied repository with that transaction.
   */
  withTransaction<T>(
    operation: (repository: TeacherApplicationDecisionRepository) => Promise<T>,
  ): Promise<T>;
  now?: () => Date;
}

export class TeacherApplicationDecisionValidationError extends Error {
  constructor(readonly issues: ZodError["issues"]) {
    super("Teacher application decision input is invalid.");
    this.name = "TeacherApplicationDecisionValidationError";
  }
}

export class TeacherApplicationDecisionNotFoundError extends Error {
  constructor() {
    super("Teacher application was not found.");
    this.name = "TeacherApplicationDecisionNotFoundError";
  }
}

export class TeacherApplicationDecisionConflictError extends Error {
  constructor() {
    super("The teacher application can no longer be decided.");
    this.name = "TeacherApplicationDecisionConflictError";
  }
}

const administratorIdSchema = z.uuid();

function validate<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new TeacherApplicationDecisionValidationError(error.issues);
    }

    throw error;
  }
}

function toDecisionResponse(
  application: TeacherApplication,
  reviewer: TeacherApplicationDecisionUser,
): AdminTeacherApplicationDecisionResponse {
  if (application.status !== "approved" && application.status !== "rejected") {
    throw new TeacherApplicationDecisionConflictError();
  }

  if (!application.reviewedAt) {
    throw new TeacherApplicationDecisionConflictError();
  }

  return adminTeacherApplicationDecisionResponseSchema.parse({
    applicationId: application.id,
    status: application.status,
    reviewedAt: application.reviewedAt.toISOString(),
    reviewer: {
      id: reviewer.id,
      displayName: reviewer.displayName,
      email: reviewer.email,
    },
  });
}

export function createTeacherApplicationDecisionService({
  withTransaction,
  now = () => new Date(),
}: TeacherApplicationDecisionServiceDependencies) {
  return {
    async approveApplication(
      applicationId: unknown,
      administratorId: unknown,
      input: unknown,
    ): Promise<AdminTeacherApplicationDecisionResponse> {
      const validatedApplicationId = validate(
        () =>
          adminTeacherApplicationDecisionParamsSchema.parse({
            applicationId,
          }).applicationId,
      );
      const validatedAdministratorId = validate(() =>
        administratorIdSchema.parse(administratorId),
      );
      const request = validate(() =>
        approveTeacherApplicationRequestSchema.parse(input),
      );

      return withTransaction(async (repository) => {
        const application = await repository.findApplicationForUpdate(
          validatedApplicationId,
        );

        if (!application) {
          throw new TeacherApplicationDecisionNotFoundError();
        }

        if (application.status !== "pending") {
          throw new TeacherApplicationDecisionConflictError();
        }

        const [applicant, reviewer] = await Promise.all([
          repository.findUserById(application.userId),
          repository.findUserById(validatedAdministratorId),
        ]);

        if (!applicant || !reviewer) {
          throw new TeacherApplicationDecisionConflictError();
        }

        const reviewedAt = now();
        const updateInput: ApprovePendingApplicationInput = {
          applicationId: validatedApplicationId,
          reviewedAt,
          reviewedBy: validatedAdministratorId,
          reviewNotes: request.reviewNotes,
        };
        const approved =
          await repository.approvePendingApplication(updateInput);

        if (!approved) {
          throw new TeacherApplicationDecisionConflictError();
        }

        const profileInput: CreateTeacherProfileInput = {
          userId: applicant.id,
          displayName: applicant.displayName,
          biography: null,
          qualifications: application.qualifications,
        };
        const profile = await repository.createTeacherProfile(profileInput);

        if (!profile) {
          throw new TeacherApplicationDecisionConflictError();
        }

        const grantedRole = await repository.grantTeacherRole(applicant.id);

        if (!grantedRole) {
          throw new TeacherApplicationDecisionConflictError();
        }

        return toDecisionResponse(approved, reviewer);
      });
    },

    async rejectApplication(
      applicationId: unknown,
      administratorId: unknown,
      input: unknown,
    ): Promise<AdminTeacherApplicationDecisionResponse> {
      const validatedApplicationId = validate(
        () =>
          adminTeacherApplicationDecisionParamsSchema.parse({
            applicationId,
          }).applicationId,
      );
      const validatedAdministratorId = validate(() =>
        administratorIdSchema.parse(administratorId),
      );
      const request = validate(() =>
        rejectTeacherApplicationRequestSchema.parse(input),
      );

      return withTransaction(async (repository) => {
        const application = await repository.findApplicationForUpdate(
          validatedApplicationId,
        );

        if (!application) {
          throw new TeacherApplicationDecisionNotFoundError();
        }

        if (application.status !== "pending") {
          throw new TeacherApplicationDecisionConflictError();
        }

        const reviewer = await repository.findUserById(
          validatedAdministratorId,
        );

        if (!reviewer) {
          throw new TeacherApplicationDecisionConflictError();
        }

        const rejected = await repository.rejectPendingApplication({
          applicationId: validatedApplicationId,
          reviewedAt: now(),
          reviewedBy: validatedAdministratorId,
          rejectionReason: request.rejectionReason,
          reviewNotes: request.reviewNotes,
        });

        if (!rejected) {
          throw new TeacherApplicationDecisionConflictError();
        }

        return toDecisionResponse(rejected, reviewer);
      });
    },
  };
}
