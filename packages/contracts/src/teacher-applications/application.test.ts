import { describe, expect, it } from "vitest";

import {
  getMyTeacherApplicationResponseSchema,
  submitTeacherApplicationRequestSchema,
  teacherApplicationResponseSchema,
} from "./application.js";

const applicationBase = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
  submittedAt: "2026-11-14T12:00:00.000Z",
};

describe("submitTeacherApplicationRequestSchema", () => {
  it("trims valid application text", () => {
    expect(
      submitTeacherApplicationRequestSchema.parse({
        motivation: "  I want to support learners.  ",
        qualifications: "  Synthetic teaching experience.  ",
      }),
    ).toEqual({
      motivation: "I want to support learners.",
      qualifications: "Synthetic teaching experience.",
    });
  });

  it("rejects blank, overlong, and unexpected request fields", () => {
    expect(
      submitTeacherApplicationRequestSchema.safeParse({
        motivation: "   ",
        qualifications: "Teaching experience.",
      }).success,
    ).toBe(false);

    expect(
      submitTeacherApplicationRequestSchema.safeParse({
        motivation: "I want to teach.",
        qualifications: "q".repeat(5_001),
      }).success,
    ).toBe(false);

    expect(
      submitTeacherApplicationRequestSchema.safeParse({
        motivation: "I want to teach.",
        qualifications: "Teaching experience.",
        status: "approved",
      }).success,
    ).toBe(false);
  });
});

describe("teacherApplicationResponseSchema", () => {
  it("accepts a pending application without review metadata", () => {
    expect(
      teacherApplicationResponseSchema.parse({
        ...applicationBase,
        status: "pending",
        reviewedAt: null,
        rejectionReason: null,
      }),
    ).toMatchObject({ status: "pending" });
  });

  it("accepts an approved application with its review timestamp", () => {
    expect(
      teacherApplicationResponseSchema.parse({
        ...applicationBase,
        status: "approved",
        reviewedAt: "2026-11-15T12:00:00.000Z",
        rejectionReason: null,
      }),
    ).toMatchObject({ status: "approved" });
  });

  it("requires a review timestamp and reason for rejected applications", () => {
    const rejected = {
      ...applicationBase,
      status: "rejected",
      reviewedAt: "2026-11-15T12:00:00.000Z",
      rejectionReason: "Please provide more relevant experience.",
    };

    expect(teacherApplicationResponseSchema.safeParse(rejected).success).toBe(
      true,
    );

    expect(
      teacherApplicationResponseSchema.safeParse({
        ...rejected,
        rejectionReason: "   ",
      }).success,
    ).toBe(false);

    expect(
      teacherApplicationResponseSchema.safeParse({
        ...rejected,
        reviewedAt: null,
      }).success,
    ).toBe(false);
  });

  it("rejects internal review fields and unexpected response data", () => {
    expect(
      teacherApplicationResponseSchema.safeParse({
        ...applicationBase,
        status: "rejected",
        reviewedAt: "2026-11-15T12:00:00.000Z",
        rejectionReason: "Please provide more relevant experience.",
        reviewNotes: "Internal administrator note.",
        reviewedBy: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(false);
  });
});

describe("getMyTeacherApplicationResponseSchema", () => {
  it("accepts a user who has not submitted an application", () => {
    expect(
      getMyTeacherApplicationResponseSchema.parse({ application: null }),
    ).toEqual({ application: null });
  });

  it("accepts the user's public application response", () => {
    expect(
      getMyTeacherApplicationResponseSchema.parse({
        application: {
          ...applicationBase,
          status: "pending",
          reviewedAt: null,
          rejectionReason: null,
        },
      }).application?.status,
    ).toBe("pending");
  });
});
