import { describe, expect, it } from "vitest";

import {
  ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH,
  adminTeacherApplicationDecisionParamsSchema,
  adminTeacherApplicationDecisionResponseSchema,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
} from "./admin-decisions.js";

const applicationId = "550e8400-e29b-41d4-a716-446655440001";

const reviewer = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  displayName: "Synthetic Administrator",
  email: "admin@example.test",
};

describe("admin teacher application decision params", () => {
  it("accepts a UUID application ID", () => {
    expect(
      adminTeacherApplicationDecisionParamsSchema.parse({ applicationId }),
    ).toEqual({ applicationId });
  });

  it("rejects invalid IDs and unexpected path parameters", () => {
    expect(
      adminTeacherApplicationDecisionParamsSchema.safeParse({
        applicationId: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationDecisionParamsSchema.safeParse({
        applicationId,
        userId: reviewer.id,
      }).success,
    ).toBe(false);
  });
});

describe("approveTeacherApplicationRequestSchema", () => {
  it("allows an approval without notes", () => {
    expect(approveTeacherApplicationRequestSchema.parse({})).toEqual({});
  });

  it("trims optional review notes", () => {
    expect(
      approveTeacherApplicationRequestSchema.parse({
        reviewNotes: "  Synthetic review note.  ",
      }),
    ).toEqual({ reviewNotes: "Synthetic review note." });
  });

  it("accepts notes at the maximum length and rejects invalid notes", () => {
    const maximumLengthText = "n".repeat(
      ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH,
    );

    expect(
      approveTeacherApplicationRequestSchema.safeParse({
        reviewNotes: maximumLengthText,
      }).success,
    ).toBe(true);

    for (const reviewNotes of [
      "",
      "   ",
      "n".repeat(ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH + 1),
    ]) {
      expect(
        approveTeacherApplicationRequestSchema.safeParse({ reviewNotes })
          .success,
      ).toBe(false);
    }
  });

  it("rejects unknown fields", () => {
    expect(
      approveTeacherApplicationRequestSchema.safeParse({
        reviewNotes: "Valid note.",
        status: "approved",
      }).success,
    ).toBe(false);
  });
});

describe("rejectTeacherApplicationRequestSchema", () => {
  it("requires and trims a rejection reason", () => {
    expect(
      rejectTeacherApplicationRequestSchema.parse({
        rejectionReason: "  Please add relevant experience.  ",
      }),
    ).toEqual({
      rejectionReason: "Please add relevant experience.",
    });
  });

  it("accepts optional review notes separately from the rejection reason", () => {
    expect(
      rejectTeacherApplicationRequestSchema.parse({
        rejectionReason: "Please add relevant experience.",
        reviewNotes: "Internal synthetic note.",
      }),
    ).toEqual({
      rejectionReason: "Please add relevant experience.",
      reviewNotes: "Internal synthetic note.",
    });
  });

  it("rejects blank or over-limit rejection reasons and notes", () => {
    const tooLong = "r".repeat(
      ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH + 1,
    );

    for (const rejectionReason of ["", "   ", tooLong]) {
      expect(
        rejectTeacherApplicationRequestSchema.safeParse({ rejectionReason })
          .success,
      ).toBe(false);
    }

    expect(
      rejectTeacherApplicationRequestSchema.safeParse({
        rejectionReason: "A valid reason.",
        reviewNotes: tooLong,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      rejectTeacherApplicationRequestSchema.safeParse({
        rejectionReason: "A valid reason.",
        reviewedBy: reviewer.id,
      }).success,
    ).toBe(false);
  });
});

describe("adminTeacherApplicationDecisionResponseSchema", () => {
  it.each(["approved", "rejected"] as const)(
    "accepts the %s decision response",
    (status) => {
      expect(
        adminTeacherApplicationDecisionResponseSchema.parse({
          applicationId,
          status,
          reviewedAt: "2026-11-15T12:00:00.000Z",
          reviewer,
        }),
      ).toMatchObject({ applicationId, status, reviewer });
    },
  );

  it("rejects pending status, invalid timestamps, and sensitive fields", () => {
    const baseResponse = {
      applicationId,
      status: "approved",
      reviewedAt: "2026-11-15T12:00:00.000Z",
      reviewer,
    };

    expect(
      adminTeacherApplicationDecisionResponseSchema.safeParse({
        ...baseResponse,
        status: "pending",
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationDecisionResponseSchema.safeParse({
        ...baseResponse,
        reviewedAt: "not-a-timestamp",
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationDecisionResponseSchema.safeParse({
        ...baseResponse,
        reviewNotes: "Internal notes must not be in this response.",
      }).success,
    ).toBe(false);

    expect(
      adminTeacherApplicationDecisionResponseSchema.safeParse({
        ...baseResponse,
        reviewer: {
          ...reviewer,
          passwordHash: "$argon2id$synthetic-hash",
        },
      }).success,
    ).toBe(false);
  });
});
