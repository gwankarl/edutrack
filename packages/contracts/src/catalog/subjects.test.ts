import { describe, expect, it } from "vitest";

import {
  subjectListResponseSchema,
  subjectResponseSchema,
} from "./subjects.js";

const subjects = [
  {
    id: "550e8400-e29b-41d4-a716-446655440010",
    code: "english",
    name: "English",
    sortOrder: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440011",
    code: "mathematics",
    name: "Mathematics",
    sortOrder: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440012",
    code: "biology",
    name: "Biology",
    sortOrder: 2,
  },
] as const;

describe("subjectResponseSchema", () => {
  it("accepts a safe subject response", () => {
    expect(subjectResponseSchema.parse(subjects[0])).toEqual(subjects[0]);
  });

  it("rejects invalid IDs, codes, blank names, and unexpected fields", () => {
    expect(
      subjectResponseSchema.safeParse({
        ...subjects[0],
        id: "not-a-uuid",
      }).success,
    ).toBe(false);

    expect(
      subjectResponseSchema.safeParse({
        ...subjects[0],
        code: "Mathematics",
      }).success,
    ).toBe(false);

    expect(
      subjectResponseSchema.safeParse({
        ...subjects[0],
        name: "   ",
      }).success,
    ).toBe(false);

    expect(
      subjectResponseSchema.safeParse({
        ...subjects[0],
        internalNotes: "not part of the public contract",
      }).success,
    ).toBe(false);
  });
});

describe("subjectListResponseSchema", () => {
  it("accepts repository results in alphabetical name order", () => {
    const alphabeticallyOrdered = [subjects[2], subjects[0], subjects[1]];

    expect(
      subjectListResponseSchema.parse({ items: alphabeticallyOrdered }).items,
    ).toHaveLength(3);
  });

  it("accepts an empty subject list", () => {
    expect(subjectListResponseSchema.parse({ items: [] })).toEqual({
      items: [],
    });
  });
});
