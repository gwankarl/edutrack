import { describe, expect, it } from "vitest";

import {
  LESSON_CONTENT_MAX_BYTES,
  createTeacherLessonRequestSchema,
  reorderTeacherLessonsRequestSchema,
  teacherCourseTopicLessonParamsSchema,
  teacherLessonListResponseSchema,
  teacherLessonResponseSchema,
  tiptapLessonDocumentSchema,
  updateTeacherLessonRequestSchema,
} from "./lessons.js";

const courseId = "00000000-0000-4000-8000-000000000001";
const topicId = "00000000-0000-4000-8000-000000000002";
const lessonId = "00000000-0000-4000-8000-000000000003";

const lesson = {
  id: lessonId,
  topicId,
  title: "Introduction",
  content: null,
  position: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("teacher lesson contracts", () => {
  it("trims a valid title and permits incomplete draft content", () => {
    expect(
      createTeacherLessonRequestSchema.parse({ title: "  Introduction  " }),
    ).toEqual({ title: "Introduction" });
  });

  it("accepts object lesson content", () => {
    expect(
      createTeacherLessonRequestSchema.parse({
        title: "Introduction",
        content: { blocks: [{ type: "paragraph", text: "Welcome." }] },
      }),
    ).toEqual({
      title: "Introduction",
      content: { blocks: [{ type: "paragraph", text: "Welcome." }] },
    });
  });

  it("accepts bounded structured Tiptap content with text, tables, and math", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Linear equations" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Solve " },
            { type: "inlineMath", attrs: { latex: "x+2=5" } },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph" }] },
                { type: "tableCell", content: [{ type: "paragraph" }] },
              ],
            },
          ],
        },
      ],
    };

    expect(tiptapLessonDocumentSchema.parse(document)).toEqual(document);
    expect(
      createTeacherLessonRequestSchema.safeParse({
        title: "Equations",
        content: document,
      }).success,
    ).toBe(true);
  });

  it("rejects unsafe links, non-HTTPS image sources, unknown nodes, and oversized content", () => {
    const unsafeLink = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bad link",
              marks: [
                { type: "link", attrs: { href: "javascript:alert(1)" } },
              ],
            },
          ],
        },
      ],
    };
    const unsafeImage = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "data:image/svg+xml,evil" } }],
    };

    expect(tiptapLessonDocumentSchema.safeParse(unsafeLink).success).toBe(false);
    expect(tiptapLessonDocumentSchema.safeParse(unsafeImage).success).toBe(false);
    expect(
      tiptapLessonDocumentSchema.safeParse({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "https://tracking.example.test/pixel" } },
        ],
      }).success,
    ).toBe(false);
    expect(
      tiptapLessonDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "image", attrs: { src: "/uploads/diagram.webp" } }],
      }).success,
    ).toBe(true);
    expect(
      tiptapLessonDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "script", attrs: { src: "https://example.test/x" } }],
      }).success,
    ).toBe(false);
    expect(
      tiptapLessonDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "text", text: "x".repeat(LESSON_CONTENT_MAX_BYTES) }],
      }).success,
    ).toBe(false);
  });

  it("rejects blank titles, non-object content, and server-controlled fields", () => {
    expect(
      createTeacherLessonRequestSchema.safeParse({ title: " " }).success,
    ).toBe(false);

    expect(
      createTeacherLessonRequestSchema.safeParse({
        title: "Introduction",
        content: "plain text",
      }).success,
    ).toBe(false);

    expect(
      createTeacherLessonRequestSchema.safeParse({
        title: "Introduction",
        position: 1,
      }).success,
    ).toBe(false);
  });

  it("requires at least one field in an update", () => {
    expect(updateTeacherLessonRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTeacherLessonRequestSchema.parse({ content: null })).toEqual({
      content: null,
    });
  });

  it("validates all nested route UUIDs", () => {
    expect(
      teacherCourseTopicLessonParamsSchema.safeParse({
        courseId,
        topicId,
        lessonId,
      }).success,
    ).toBe(true);

    expect(
      teacherCourseTopicLessonParamsSchema.safeParse({
        courseId,
        topicId,
        lessonId: "invalid",
      }).success,
    ).toBe(false);
  });

  it("validates safe lesson responses and ordered lesson lists", () => {
    expect(teacherLessonResponseSchema.parse(lesson)).toEqual(lesson);

    expect(
      teacherLessonListResponseSchema.safeParse({
        items: [
          lesson,
          {
            ...lesson,
            id: "00000000-0000-4000-8000-000000000004",
            position: 2,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      teacherLessonListResponseSchema.safeParse({
        items: [
          lesson,
          {
            ...lesson,
            id: "00000000-0000-4000-8000-000000000004",
            position: 1,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts a complete ordered ID array and rejects duplicates or extra fields", () => {
    expect(
      reorderTeacherLessonsRequestSchema.parse({ lessonIds: [lessonId] }),
    ).toEqual({
      lessonIds: [lessonId],
    });
    expect(reorderTeacherLessonsRequestSchema.parse({ lessonIds: [] })).toEqual(
      {
        lessonIds: [],
      },
    );
    expect(
      reorderTeacherLessonsRequestSchema.safeParse({
        lessonIds: [lessonId, lessonId],
      }).success,
    ).toBe(false);
    expect(
      reorderTeacherLessonsRequestSchema.safeParse({ lessonIds: ["invalid"] })
        .success,
    ).toBe(false);
    expect(
      reorderTeacherLessonsRequestSchema.safeParse({
        lessonIds: [],
        positions: [],
      }).success,
    ).toBe(false);
  });
});
