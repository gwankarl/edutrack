import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityCurrentUserRecord } from "../identity/identity.repository.js";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";
import {
  PendingTeacherApplicationExistsError,
  type TeacherApplicationRecord,
} from "./teacher-application.repository.js";
import {
  createTeacherApplicationService,
  TeacherApplicationAlreadyApprovedError,
  TeacherApplicationNotEligibleError,
  TeacherRoleAlreadyAssignedError,
} from "./teacher-application.service.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const applicationId = "550e8400-e29b-41d4-a716-446655440001";

function makeApplication(
  overrides: Partial<TeacherApplicationRecord> = {},
): TeacherApplicationRecord {
  return {
    id: applicationId,
    userId,
    status: "pending",
    motivation: "I want to support learners.",
    qualifications: "Synthetic teaching experience.",
    submittedAt: new Date("2026-11-14T12:00:00.000Z"),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    reviewNotes: null,
    ...overrides,
  };
}

function makeService() {
  const activeUser: IdentityCurrentUserRecord = {
    id: userId,
    email: "teacher@example.test",
    displayName: "Synthetic Applicant",
    accountStatus: "active",
    emailVerifiedAt: new Date("2026-11-01T12:00:00.000Z"),
  };

  const identityRepository = {
    findCurrentUserById: vi.fn(
      async (): Promise<IdentityCurrentUserRecord | null> => activeUser,
    ),
    findRolesByUserId: vi.fn(async (): Promise<UserRole[]> => ["student"]),
  };

  const repository = {
    createApplication: vi.fn(async () => makeApplication()),
    findLatestByUserId: vi.fn(
      async () => null as TeacherApplicationRecord | null,
    ),
    hasPendingApplication: vi.fn(async () => false),
  };

  return {
    service: createTeacherApplicationService({
      repository,
      identityRepository,
    }),
    repository,
    identityRepository,
    activeUser,
  };
}

describe("teacher application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and submits an eligible user's application", async () => {
    const { service, repository } = makeService();

    await expect(
      service.submitApplication(userId, {
        motivation: "  I want to support learners.  ",
        qualifications: "  Synthetic teaching experience.  ",
      }),
    ).resolves.toEqual({
      id: applicationId,
      status: "pending",
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
      submittedAt: "2026-11-14T12:00:00.000Z",
      reviewedAt: null,
      rejectionReason: null,
    });

    expect(repository.createApplication).toHaveBeenCalledWith({
      userId,
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
    });
  });

  it("rejects missing, inactive, and unverified users", async () => {
    const missingUser = makeService();
    missingUser.identityRepository.findCurrentUserById.mockResolvedValue(null);

    await expect(
      missingUser.service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationNotEligibleError);

    const inactiveUser = makeService();
    inactiveUser.identityRepository.findCurrentUserById.mockResolvedValue({
      ...inactiveUser.activeUser,
      accountStatus: "suspended",
    });

    await expect(
      inactiveUser.service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationNotEligibleError);

    const unverifiedUser = makeService();
    unverifiedUser.identityRepository.findCurrentUserById.mockResolvedValue({
      ...unverifiedUser.activeUser,
      emailVerifiedAt: null,
    });

    await expect(
      unverifiedUser.service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationNotEligibleError);
  });

  it("rejects a user who already has the Teacher role", async () => {
    const { service, identityRepository, repository } = makeService();
    identityRepository.findRolesByUserId.mockResolvedValue([
      "student",
      "teacher",
    ]);

    await expect(
      service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(TeacherRoleAlreadyAssignedError);

    expect(repository.createApplication).not.toHaveBeenCalled();
  });

  it("rejects users who already have a pending application", async () => {
    const { service, repository } = makeService();
    repository.hasPendingApplication.mockResolvedValue(true);

    await expect(
      service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(PendingTeacherApplicationExistsError);

    expect(repository.createApplication).not.toHaveBeenCalled();
  });

  it("allows reapplication after rejection and exposes only the rejection reason", async () => {
    const { service, repository } = makeService();
    repository.findLatestByUserId.mockResolvedValue(
      makeApplication({
        status: "rejected",
        reviewedAt: new Date("2026-11-10T12:00:00.000Z"),
        reviewedBy: "550e8400-e29b-41d4-a716-446655440002",
        rejectionReason: "Please provide more relevant teaching experience.",
        reviewNotes: "Private administrator note that must not be returned.",
      }),
    );

    await expect(
      service.submitApplication(userId, {
        motivation: "I have updated my application.",
        qualifications: "Additional synthetic experience.",
      }),
    ).resolves.toMatchObject({ status: "pending" });

    expect(repository.createApplication).toHaveBeenCalledTimes(1);
  });

  it("prevents reapplication after approval", async () => {
    const { service, repository } = makeService();
    repository.findLatestByUserId.mockResolvedValue(
      makeApplication({
        status: "approved",
        reviewedAt: new Date("2026-11-10T12:00:00.000Z"),
        reviewedBy: "550e8400-e29b-41d4-a716-446655440002",
      }),
    );

    await expect(
      service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(TeacherApplicationAlreadyApprovedError);

    expect(repository.createApplication).not.toHaveBeenCalled();
  });

  it("maps a concurrent pending-application conflict to the repository error", async () => {
    const { service, repository } = makeService();
    repository.findLatestByUserId.mockResolvedValue(
      makeApplication({
        status: "rejected",
        reviewedAt: new Date("2026-11-10T12:00:00.000Z"),
        reviewedBy: "550e8400-e29b-41d4-a716-446655440002",
        rejectionReason: "Please provide more relevant experience.",
      }),
    );
    repository.createApplication.mockRejectedValue(
      new PendingTeacherApplicationExistsError(),
    );

    await expect(
      service.submitApplication(userId, {
        motivation: "I want to support learners.",
        qualifications: "Teaching experience.",
      }),
    ).rejects.toBeInstanceOf(PendingTeacherApplicationExistsError);
  });

  it("returns the latest application in the public response shape", async () => {
    const { service, repository } = makeService();
    repository.findLatestByUserId.mockResolvedValue(
      makeApplication({
        status: "rejected",
        reviewedAt: new Date("2026-11-10T12:00:00.000Z"),
        reviewedBy: "550e8400-e29b-41d4-a716-446655440002",
        rejectionReason: "Please provide more relevant teaching experience.",
        reviewNotes: "Private administrator note that must not be returned.",
      }),
    );

    const result = await service.getMyApplication(userId);

    expect(result.application).toEqual({
      id: applicationId,
      status: "rejected",
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
      submittedAt: "2026-11-14T12:00:00.000Z",
      reviewedAt: "2026-11-10T12:00:00.000Z",
      rejectionReason: "Please provide more relevant teaching experience.",
    });
    expect(result.application).not.toHaveProperty("reviewNotes");
    expect(result.application).not.toHaveProperty("reviewedBy");
    expect(JSON.stringify(result)).not.toContain("Private administrator note");
  });

  it("returns null when the user has no application", async () => {
    const { service } = makeService();

    await expect(service.getMyApplication(userId)).resolves.toEqual({
      application: null,
    });
  });
});
