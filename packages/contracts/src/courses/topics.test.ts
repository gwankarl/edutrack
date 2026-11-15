import { describe, expect, it } from "vitest";

import {
  createTeacherTopicRequestSchema,
  reorderTeacherTopicsRequestSchema,
  teacherCourseTopicParamsSchema,
  teacherTopicListResponseSchema,
  teacherTopicResponseSchema,
  updateTeacherTopicRequestSchema,
} from "./topics.js";

const courseId = "00000000-0000-4000-8000-000000000001";
const topicId = "00000000-0000-4000-8000-000000000002";

const topic = {
  id: topicId,
  courseId,
  title: "Number Systems",
  description: null,
  position: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("teacher topic contracts", () => {
  it("trims valid creation input", () => {
    expect(
      createTeacherTopicRequestSchema.parse({
        title: "  Number Systems  ",
        description: "  Integers and rational numbers  ",
      }),
    ).toEqual({
      title: "Number Systems",
      description: "Integers and rational numbers",
    });
  });

  it("allows an optional description", () => {
    expect(
      createTeacherTopicRequestSchema.parse({ title: "Number Systems" }),
    ).toEqual({ title: "Number Systems" });
  });

  it("rejects blank titles and server-controlled positions", () => {
    expect(
      createTeacherTopicRequestSchema.safeParse({
        title: "   ",
      }).success,
    ).toBe(false);

    expect(
      createTeacherTopicRequestSchema.safeParse({
        title: "Number Systems",
        position: 1,
      }).success,
    ).toBe(false);
  });

  it("requires at least one field in an update", () => {
    expect(updateTeacherTopicRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateTeacherTopicRequestSchema.parse({ description: null }),
    ).toEqual({ description: null });
  });

  it("validates nested route UUIDs", () => {
    expect(
      teacherCourseTopicParamsSchema.safeParse({ courseId, topicId }).success,
    ).toBe(true);
    expect(
      teacherCourseTopicParamsSchema.safeParse({
        courseId: "not-a-uuid",
        topicId,
      }).success,
    ).toBe(false);
  });

  it("validates safe topic responses and ordered topic lists", () => {
    expect(teacherTopicResponseSchema.parse(topic)).toEqual(topic);

    expect(
      teacherTopicListResponseSchema.safeParse({
        items: [
          topic,
          { ...topic, id: "00000000-0000-4000-8000-000000000003", position: 2 },
        ],
      }).success,
    ).toBe(true);

    expect(
      teacherTopicListResponseSchema.safeParse({
        items: [
          topic,
          { ...topic, id: "00000000-0000-4000-8000-000000000003", position: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a complete ordered ID array and rejects duplicates or extra fields", () => {
    expect(
      reorderTeacherTopicsRequestSchema.parse({ topicIds: [topicId] }),
    ).toEqual({
      topicIds: [topicId],
    });
    expect(reorderTeacherTopicsRequestSchema.parse({ topicIds: [] })).toEqual({
      topicIds: [],
    });
    expect(
      reorderTeacherTopicsRequestSchema.safeParse({
        topicIds: [topicId, topicId],
      }).success,
    ).toBe(false);
    expect(
      reorderTeacherTopicsRequestSchema.safeParse({ topicIds: ["invalid"] })
        .success,
    ).toBe(false);
    expect(
      reorderTeacherTopicsRequestSchema.safeParse({
        topicIds: [],
        positions: [],
      }).success,
    ).toBe(false);
  });
});
