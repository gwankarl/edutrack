import { describe, expect, it } from "vitest";

import {
  adminTeacherApplicationListQuerySchema,
  adminTeacherApplicationListResponseSchema,
  adminTeacherApplicationParamsSchema,
  adminTeacherApplicationResponseSchema,
} from "./admin.js";

const applicant = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  displayName: "Synthetic Applicant",
  email: "applicant@example.test",
};

const reviewer = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  displayName: "Synthetic Administrator",
  email: "administrator@example.test",
};

const applicationFields = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  applicant,
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
};

describe("adminTeacherApplicationListQuerySchema", () => {
  it("applies pagination defaults and parses query strings", () => {
    expect(adminTeacherApplicationListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });

    expect(
      adminTeacherApplicationListQuerySchema.parse({
        status: "pending",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      status: "pending",
      page: 2,
      pageSize: 50,
    });
  });

  it("rejects invalid status, pagination, and unexpected query keys", () => {
    for (const query of [
      { status: "withdrawn" },
      { page: "0" },
      { page: "1.5" },
      { pageSize: "101" },
      { pageSize: "0" },
      { unexpected: "value" },
    ]) {
      expect(
        adminTeacherApplicationListQuerySchema.safeParse(query).success,
      ).toBe(false);
    }
  });
});

describe("adminTeacherApplicationParamsSchema", () => {
  it("accepts a valid application UUID", () => {
    expect(
      adminTeacherApplicationParamsSchema.parse({
        applicationId: applicationFields.id,
      }),
    ).toEqual({ applicationId: applicationFields.id });
  });

  it("rejects invalid UUIDs and unexpected params", () => {
    expect(
      adminTeacherApplicationParamsSchema.safeParse({
        applicationId: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationParamsSchema.safeParse({
        applicationId: applicationFields.id,
        userId: applicant.id,
      }).success,
    ).toBe(false);
  });
});

describe("adminTeacherApplicationResponseSchema", () => {
  it("accepts a pending application with applicant identification", () => {
    expect(
      adminTeacherApplicationResponseSchema.parse({
        ...applicationFields,
        status: "pending",
        reviewedAt: null,
        reviewer: null,
        rejectionReason: null,
        reviewNotes: null,
      }),
    ).toMatchObject({
      status: "pending",
      applicant,
      reviewer: null,
    });
  });

  it("accepts reviewed applications with reviewer details and notes", () => {
    expect(
      adminTeacherApplicationResponseSchema.parse({
        ...applicationFields,
        status: "approved",
        reviewedAt: "2026-11-15T12:00:00.000Z",
        reviewer,
        rejectionReason: null,
        reviewNotes: "Internal synthetic review note.",
      }),
    ).toMatchObject({
      status: "approved",
      reviewer,
      reviewNotes: "Internal synthetic review note.",
    });

    expect(
      adminTeacherApplicationResponseSchema.parse({
        ...applicationFields,
        status: "rejected",
        reviewedAt: "2026-11-15T12:00:00.000Z",
        reviewer,
        rejectionReason: "Please provide more relevant experience.",
        reviewNotes: "Internal synthetic review note.",
      }),
    ).toMatchObject({
      status: "rejected",
      reviewer,
      rejectionReason: "Please provide more relevant experience.",
      reviewNotes: "Internal synthetic review note.",
    });
  });

  it("rejects incomplete review metadata and sensitive identity fields", () => {
    expect(
      adminTeacherApplicationResponseSchema.safeParse({
        ...applicationFields,
        status: "approved",
        reviewedAt: null,
        reviewer: null,
        rejectionReason: null,
        reviewNotes: null,
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationResponseSchema.safeParse({
        ...applicationFields,
        status: "pending",
        reviewedAt: null,
        reviewer: null,
        rejectionReason: null,
        reviewNotes: null,
        passwordHash: "$argon2id$synthetic-hash",
      }).success,
    ).toBe(false);
  });
});

describe("adminTeacherApplicationListResponseSchema", () => {
  it("accepts a paginated administrator list response", () => {
    expect(
      adminTeacherApplicationListResponseSchema.parse({
        items: [
          {
            ...applicationFields,
            status: "pending",
            reviewedAt: null,
            reviewer: null,
            rejectionReason: null,
            reviewNotes: null,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).pagination,
    ).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it("rejects invalid pagination metadata", () => {
    expect(
      adminTeacherApplicationListResponseSchema.safeParse({
        items: [],
        pagination: {
          page: 0,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      }).success,
    ).toBe(false);
  });
});
