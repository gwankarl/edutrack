import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TeacherApplication } from "../../infrastructure/database/schema/teacher-applications.js";
import {
  createTeacherApplicationDecisionService,
  TeacherApplicationDecisionConflictError,
  TeacherApplicationDecisionNotFoundError,
  TeacherApplicationDecisionValidationError,
  type TeacherApplicationDecisionRepository,
} from "./teacher-application-decision.service.js";

const applicationId = "550e8400-e29b-41d4-a716-446655440001";
const applicantId = "550e8400-e29b-41d4-a716-446655440002";
const administratorId = "550e8400-e29b-41d4-a716-446655440003";

const pendingApplication: TeacherApplication = {
  id: applicationId,
  userId: applicantId,
  status: "pending",
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: new Date("2026-11-14T12:00:00.000Z"),
  reviewedAt: null,
  reviewedBy: null,
  rejectionReason: null,
  reviewNotes: null,
};

const applicant = {
  id: applicantId,
  displayName: "Synthetic Applicant",
  email: "applicant@example.test",
};

const reviewer = {
  id: administratorId,
  displayName: "Synthetic Administrator",
  email: "admin@example.test",
};

function makeService() {
  let committed = false;
  let rolledBack = false;
  let transactionCalls = 0;

  const approvedApplication: TeacherApplication = {
    ...pendingApplication,
    status: "approved",
    reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
    reviewedBy: administratorId,
    reviewNotes: "Synthetic internal note.",
  };

  const rejectedApplication: TeacherApplication = {
    ...pendingApplication,
    status: "rejected",
    reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
    reviewedBy: administratorId,
    rejectionReason: "Please provide more relevant experience.",
  };

  const repository: TeacherApplicationDecisionRepository = {
    findApplicationForUpdate: vi.fn(
      async (): Promise<TeacherApplication | null> => pendingApplication,
    ),
    findUserById: vi.fn(async (userId: string) =>
      userId === applicantId ? applicant : reviewer,
    ),
    approvePendingApplication: vi.fn(
      async (): Promise<TeacherApplication | null> => approvedApplication,
    ),
    rejectPendingApplication: vi.fn(
      async (): Promise<TeacherApplication | null> => rejectedApplication,
    ),
    createTeacherProfile: vi.fn(async () => ({ id: "profile-id" })),
    grantTeacherRole: vi.fn(async () => "teacher" as const),
  };

  const withTransaction = async <T>(
    operation: (
      transactionRepository: TeacherApplicationDecisionRepository,
    ) => Promise<T>,
  ): Promise<T> => {
    transactionCalls += 1;

    try {
      const result = await operation(repository);
      committed = true;
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  };

  return {
    service: createTeacherApplicationDecisionService({
      withTransaction,
      now: () => new Date("2026-11-15T12:00:00.000Z"),
    }),
    repository,
    transactionCallCount: () => transactionCalls,
    wasCommitted: () => committed,
    wasRolledBack: () => rolledBack,
    approvedApplication,
    rejectedApplication,
  };
}

describe("teacher application decision service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves in one transaction, creates a profile, and grants Teacher", async () => {
    const { service, repository, transactionCallCount, approvedApplication } =
      makeService();

    await expect(
      service.approveApplication(applicationId, administratorId, {
        reviewNotes: "  Synthetic internal note.  ",
      }),
    ).resolves.toEqual({
      applicationId,
      status: "approved",
      reviewedAt: "2026-11-15T12:00:00.000Z",
      reviewer,
    });

    expect(transactionCallCount()).toBe(1);
    expect(repository.findApplicationForUpdate).toHaveBeenCalledWith(
      applicationId,
    );
    expect(repository.approvePendingApplication).toHaveBeenCalledWith({
      applicationId,
      reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
      reviewedBy: administratorId,
      reviewNotes: "Synthetic internal note.",
    });
    expect(repository.createTeacherProfile).toHaveBeenCalledWith({
      userId: applicantId,
      displayName: applicant.displayName,
      biography: null,
      qualifications: pendingApplication.qualifications,
    });
    expect(repository.grantTeacherRole).toHaveBeenCalledWith(applicantId);
    expect(approvedApplication.reviewedBy).toBe(administratorId);
  });

  it("rejects in one transaction without creating a profile or granting Teacher", async () => {
    const { service, repository, transactionCallCount } = makeService();

    await expect(
      service.rejectApplication(applicationId, administratorId, {
        rejectionReason: "  Please provide more relevant experience.  ",
      }),
    ).resolves.toEqual({
      applicationId,
      status: "rejected",
      reviewedAt: "2026-11-15T12:00:00.000Z",
      reviewer,
    });

    expect(transactionCallCount()).toBe(1);
    expect(repository.rejectPendingApplication).toHaveBeenCalledWith({
      applicationId,
      reviewedAt: new Date("2026-11-15T12:00:00.000Z"),
      reviewedBy: administratorId,
      rejectionReason: "Please provide more relevant experience.",
      reviewNotes: undefined,
    });
    expect(repository.createTeacherProfile).not.toHaveBeenCalled();
    expect(repository.grantTeacherRole).not.toHaveBeenCalled();
  });

  it("returns a typed not-found error for a missing application", async () => {
    const { service, repository } = makeService();
    vi.mocked(repository.findApplicationForUpdate).mockResolvedValue(null);

    await expect(
      service.approveApplication(applicationId, administratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionNotFoundError);

    expect(repository.approvePendingApplication).not.toHaveBeenCalled();
  });

  it("returns a typed conflict for an application that was already decided", async () => {
    const { service, repository } = makeService();
    vi.mocked(repository.findApplicationForUpdate).mockResolvedValue({
      ...pendingApplication,
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: administratorId,
    });

    await expect(
      service.rejectApplication(applicationId, administratorId, {
        rejectionReason: "Not eligible.",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionConflictError);

    expect(repository.rejectPendingApplication).not.toHaveBeenCalled();
  });

  it("wraps invalid request data in a typed validation error before a transaction", async () => {
    const { service, transactionCallCount } = makeService();

    await expect(
      service.rejectApplication(applicationId, administratorId, {
        rejectionReason: "   ",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionValidationError);

    await expect(
      service.approveApplication("invalid-id", administratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionValidationError);

    expect(transactionCallCount()).toBe(0);
  });

  it("rolls back when profile creation reports a conflict", async () => {
    const { service, repository, wasCommitted, wasRolledBack } = makeService();
    vi.mocked(repository.createTeacherProfile).mockResolvedValue(null);

    await expect(
      service.approveApplication(applicationId, administratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionConflictError);

    expect(repository.grantTeacherRole).not.toHaveBeenCalled();
    expect(wasCommitted()).toBe(false);
    expect(wasRolledBack()).toBe(true);
  });

  it("rolls back all approval work when granting Teacher fails", async () => {
    const { service, repository, wasCommitted, wasRolledBack } = makeService();
    vi.mocked(repository.grantTeacherRole).mockResolvedValue(null);

    await expect(
      service.approveApplication(applicationId, administratorId, {}),
    ).rejects.toBeInstanceOf(TeacherApplicationDecisionConflictError);

    expect(wasCommitted()).toBe(false);
    expect(wasRolledBack()).toBe(true);
  });

  it("preserves the applicant's existing Student role", async () => {
    const { service, repository } = makeService();

    await service.approveApplication(applicationId, administratorId, {});

    expect(repository.grantTeacherRole).toHaveBeenCalledTimes(1);
    expect(repository).not.toHaveProperty("removeRole");
  });
});
