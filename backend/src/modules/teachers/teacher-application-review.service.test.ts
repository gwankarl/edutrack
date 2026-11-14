import { ZodError } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminTeacherApplicationListResponse,
  AdminTeacherApplicationResponse,
} from "@edutrack/contracts";
import {
  createTeacherApplicationReviewService,
  TeacherApplicationNotFoundError,
  type TeacherApplicationReviewRepository,
} from "./teacher-application-review.service.js";

const applicationId = "550e8400-e29b-41d4-a716-446655440001";
const applicantId = "550e8400-e29b-41d4-a716-446655440002";
const reviewerId = "550e8400-e29b-41d4-a716-446655440003";

const pendingApplication: AdminTeacherApplicationResponse = {
  id: applicationId,
  applicant: {
    id: applicantId,
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  status: "pending",
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
};

const approvedApplication: AdminTeacherApplicationResponse = {
  ...pendingApplication,
  status: "approved",
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer: {
    id: reviewerId,
    displayName: "Synthetic Administrator",
    email: "admin@example.test",
  },
  reviewNotes: "Internal administrator review note.",
};

const listResponse: AdminTeacherApplicationListResponse = {
  items: [pendingApplication],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 1,
    totalPages: 1,
  },
};

function makeService() {
  const repository: TeacherApplicationReviewRepository = {
    listApplications: vi.fn(
      async (): Promise<AdminTeacherApplicationListResponse> => listResponse,
    ),
    findById: vi.fn(
      async (): Promise<AdminTeacherApplicationResponse | null> =>
        pendingApplication,
    ),
  };

  return {
    service: createTeacherApplicationReviewService({ repository }),
    repository,
  };
}

describe("teacher application review service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists applications using the shared default pagination", async () => {
    const { service, repository } = makeService();

    await expect(service.listApplications()).resolves.toEqual(listResponse);
    expect(repository.listApplications).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  it("passes validated status and pagination filters to the repository", async () => {
    const { service, repository } = makeService();

    await service.listApplications({
      status: "pending",
      page: "2",
      pageSize: "25",
    });

    expect(repository.listApplications).toHaveBeenCalledWith({
      status: "pending",
      page: 2,
      pageSize: 25,
    });
  });

  it("rejects invalid filters before calling the repository", async () => {
    const { service, repository } = makeService();

    await expect(
      service.listApplications({ status: "unknown", page: "0" }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(repository.listApplications).not.toHaveBeenCalled();
  });

  it("retrieves a validated application and preserves administrator review details", async () => {
    const { service, repository } = makeService();
    vi.mocked(repository.findById).mockResolvedValue(approvedApplication);

    await expect(service.getApplicationById(applicationId)).resolves.toEqual(
      approvedApplication,
    );

    expect(repository.findById).toHaveBeenCalledWith(applicationId);
  });

  it("rejects an invalid application UUID before querying the repository", async () => {
    const { service, repository } = makeService();

    await expect(
      service.getApplicationById("not-a-uuid"),
    ).rejects.toBeInstanceOf(ZodError);

    expect(repository.findById).not.toHaveBeenCalled();
  });

  it("throws a typed not-found error when the repository returns null", async () => {
    const { service, repository } = makeService();
    vi.mocked(repository.findById).mockResolvedValue(null);

    await expect(
      service.getApplicationById(applicationId),
    ).rejects.toBeInstanceOf(TeacherApplicationNotFoundError);
  });

  it("does not replace database errors with messages that could expose internals", async () => {
    const { service, repository } = makeService();
    const databaseError = new Error("private database diagnostic");

    vi.mocked(repository.listApplications).mockRejectedValue(databaseError);

    await expect(service.listApplications()).rejects.toBe(databaseError);
  });
});
