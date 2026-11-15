import { describe, expect, it } from "vitest";

import {
  academicLevelListResponseSchema,
  academicLevelResponseSchema,
} from "./academic-levels.js";

const levels = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "form-1",
    name: "Form 1",
    educationStage: "lower_secondary",
    sortOrder: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    code: "form-2",
    name: "Form 2",
    educationStage: "lower_secondary",
    sortOrder: 2,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    code: "form-3",
    name: "Form 3",
    educationStage: "lower_secondary",
    sortOrder: 3,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440004",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440005",
    code: "form-5",
    name: "Form 5",
    educationStage: "lower_secondary",
    sortOrder: 5,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440006",
    code: "lower-sixth",
    name: "Lower Sixth",
    educationStage: "upper_secondary",
    sortOrder: 6,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440007",
    code: "upper-sixth",
    name: "Upper Sixth",
    educationStage: "upper_secondary",
    sortOrder: 7,
  },
] as const;

describe("academicLevelResponseSchema", () => {
  it("accepts a safe academic-level response", () => {
    expect(academicLevelResponseSchema.parse(levels[0])).toEqual(levels[0]);
  });

  it("rejects invalid stages, codes, IDs, and unexpected fields", () => {
    expect(
      academicLevelResponseSchema.safeParse({
        ...levels[0],
        educationStage: "middle_school",
      }).success,
    ).toBe(false);

    expect(
      academicLevelResponseSchema.safeParse({
        ...levels[0],
        code: "Form 1",
      }).success,
    ).toBe(false);

    expect(
      academicLevelResponseSchema.safeParse({
        ...levels[0],
        id: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      academicLevelResponseSchema.safeParse({
        ...levels[0],
        databaseId: 123,
      }).success,
    ).toBe(false);
  });
});

describe("academicLevelListResponseSchema", () => {
  it("accepts all seven levels in display order", () => {
    expect(
      academicLevelListResponseSchema.parse({ items: [...levels] }).items,
    ).toHaveLength(7);
  });

  it("accepts an empty catalog and rejects nondeterministic ordering", () => {
    expect(academicLevelListResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });

    expect(
      academicLevelListResponseSchema.safeParse({
        items: [levels[1], levels[0]],
      }).success,
    ).toBe(false);
  });
});
