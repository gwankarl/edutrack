import { z } from "zod";

export const LESSON_TITLE_MAX_LENGTH = 160;
export const LESSON_CONTENT_MAX_BYTES = 1_000_000;

const tiptapNodeTypes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "image",
  "inlineMath",
  "blockMath",
]);
const tiptapMarkTypes = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "subscript",
  "superscript",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isWithinLessonContentLimit(value: unknown): boolean {
  try {
    return (
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      LESSON_CONTENT_MAX_BYTES
    );
  } catch {
    return false;
  }
}

function isSafeWebUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isSafeImageSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4_096) return false;
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\r\n]/.test(value)
  );
}

function isTiptapMark(value: unknown): boolean {
  if (!isPlainObject(value) || typeof value.type !== "string") return false;
  if (!tiptapMarkTypes.has(value.type)) return false;
  if (value.attrs === undefined) return value.type !== "link";
  if (!isPlainObject(value.attrs)) return false;

  if (value.type === "link") {
    return (
      Object.keys(value.attrs).every((key) =>
        ["href", "target", "rel", "class"].includes(key),
      ) &&
      isSafeWebUrl(value.attrs.href) &&
      (value.attrs.target === undefined ||
        value.attrs.target === null ||
        value.attrs.target === "_blank" ||
        value.attrs.target === "_self") &&
      (value.attrs.rel === undefined ||
        value.attrs.rel === null ||
        (typeof value.attrs.rel === "string" &&
          value.attrs.rel.length <= 100 &&
          !/[<>"']/.test(value.attrs.rel))) &&
      (value.attrs.class === undefined ||
        value.attrs.class === null ||
        (typeof value.attrs.class === "string" &&
          /^[\w\s-]{0,100}$/.test(value.attrs.class)))
    );
  }

  return false;
}

function isTiptapNode(value: unknown, depth = 0): boolean {
  if (depth > 64 || !isPlainObject(value) || typeof value.type !== "string") {
    return false;
  }
  if (!tiptapNodeTypes.has(value.type)) return false;
  if (value.marks !== undefined && value.type !== "text") return false;
  if (value.text !== undefined && typeof value.text !== "string") return false;
  if (
    typeof value.text === "string" &&
    (value.type !== "text" || value.text.length > 100_000)
  ) {
    return false;
  }
  if (
    value.content !== undefined &&
    (!Array.isArray(value.content) ||
      value.content.length > 20_000 ||
      !value.content.every((child) => isTiptapNode(child, depth + 1)))
  ) {
    return false;
  }
  if (
    value.marks !== undefined &&
    (!Array.isArray(value.marks) ||
      value.marks.length > 16 ||
      !value.marks.every(isTiptapMark))
  ) {
    return false;
  }
  if (value.attrs !== undefined && !isPlainObject(value.attrs)) return false;
  if (
    value.attrs !== undefined &&
    ![
      "heading",
      "orderedList",
      "codeBlock",
      "image",
      "inlineMath",
      "blockMath",
      "tableCell",
      "tableHeader",
    ].includes(value.type)
  ) {
    return false;
  }

  if (value.type === "doc") {
    return (
      depth === 0 &&
      Array.isArray(value.content) &&
      value.content.every((child) =>
        [
          "paragraph",
          "heading",
          "bulletList",
          "orderedList",
          "blockquote",
          "codeBlock",
          "horizontalRule",
          "table",
          "image",
          "blockMath",
        ].includes((child as Record<string, unknown>).type as string),
      )
    );
  }
  if (value.type === "text") {
    return typeof value.text === "string" && value.content === undefined;
  }
  if (Array.isArray(value.content)) {
    const childTypes = value.content.map((child) =>
      isPlainObject(child) ? child.type : undefined,
    );
    const allowedChildren: Record<string, string[]> = {
      paragraph: ["text", "hardBreak", "inlineMath"],
      heading: ["text", "hardBreak", "inlineMath"],
      bulletList: ["listItem"],
      orderedList: ["listItem"],
      listItem: [
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "blockquote",
        "codeBlock",
        "table",
        "blockMath",
      ],
      blockquote: [
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "codeBlock",
        "table",
        "blockMath",
      ],
      codeBlock: ["text"],
      table: ["tableRow"],
      tableRow: ["tableHeader", "tableCell"],
      tableCell: [
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "blockquote",
        "codeBlock",
        "table",
        "blockMath",
      ],
      tableHeader: [
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "blockquote",
        "codeBlock",
      ],
    };
    if (
      !childTypes.every((childType) =>
        (allowedChildren[String(value.type)] ?? []).includes(String(childType)),
      )
    ) {
      return false;
    }
  } else if (
    [
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
    ].includes(value.type)
  ) {
    return false;
  }
  if (value.type === "image") {
    const imageAttributes = isPlainObject(value.attrs) ? value.attrs : {};
    const imageUrl =
      typeof imageAttributes.src === "string"
        ? imageAttributes.src
        : "";
    return (
      isPlainObject(value.attrs) &&
      Object.keys(value.attrs).every((key) =>
        ["src", "alt", "title", "width", "height"].includes(key),
      ) &&
      isSafeImageSource(imageUrl) &&
      (!value.attrs.alt ||
        (typeof value.attrs.alt === "string" && value.attrs.alt.length <= 500)) &&
      (value.attrs.title === undefined ||
        value.attrs.title === null ||
        (typeof value.attrs.title === "string" && value.attrs.title.length <= 500)) &&
      ["width", "height"].every((key) => {
        const dimension = imageAttributes[key];
        return (
          dimension === undefined ||
          dimension === null ||
          (typeof dimension === "number" &&
            Number.isInteger(dimension) &&
            dimension > 0 &&
            dimension <= 4_000)
        );
      })
    );
  }
  if (value.type === "inlineMath" || value.type === "blockMath") {
    return (
      isPlainObject(value.attrs) &&
      Object.keys(value.attrs).every((key) => key === "latex") &&
      typeof value.attrs.latex === "string" &&
      value.attrs.latex.length <= 10_000
    );
  }
  if (value.type === "heading") {
    return (
      isPlainObject(value.attrs) &&
      Object.keys(value.attrs).every((key) => key === "level") &&
      [1, 2, 3, 4, 5, 6].includes(Number(value.attrs.level))
    );
  }
  if (value.type === "orderedList") {
    return (
      value.attrs === undefined ||
      (isPlainObject(value.attrs) &&
      Object.keys(value.attrs).every((key) => ["start", "type"].includes(key)) &&
        (value.attrs.start === undefined ||
          (typeof value.attrs.start === "number" &&
            Number.isInteger(value.attrs.start) &&
            value.attrs.start > 0)) &&
        (value.attrs.type === undefined ||
          value.attrs.type === null ||
          ["1", "a", "A", "i", "I"].includes(String(value.attrs.type))))
    );
  }
  if (value.type === "codeBlock") {
    return (
      value.attrs === undefined ||
      (isPlainObject(value.attrs) &&
        Object.keys(value.attrs).every((key) => key === "language") &&
        (value.attrs.language === null ||
          value.attrs.language === undefined ||
          (typeof value.attrs.language === "string" &&
            value.attrs.language.length <= 100)))
    );
  }
  if (value.type === "tableCell" || value.type === "tableHeader") {
    const attrs = value.attrs;
    return (
      attrs === undefined ||
      (isPlainObject(attrs) &&
        Object.keys(attrs).every((key) =>
          ["colspan", "rowspan", "colwidth"].includes(key),
        ) &&
        ["colspan", "rowspan"].every((key) => {
          const span = attrs[key];
          return (
            span === undefined ||
            (typeof span === "number" &&
              Number.isInteger(span) &&
              span > 0 &&
              span <= 1_000)
          );
        }) &&
        (attrs.colwidth === undefined ||
          attrs.colwidth === null ||
          (Array.isArray(attrs.colwidth) &&
            attrs.colwidth.length <= 20 &&
            attrs.colwidth.every(
              (width) =>
                typeof width === "number" &&
                Number.isInteger(width) &&
                width > 0 &&
                width <= 4_000,
            ))))
    );
  }

  return true;
}

/** Strict, bounded Tiptap document format used for newly-authored content. */
export const tiptapLessonDocumentSchema = z
  .custom<TiptapLessonDocument>(
    (value) => isTiptapNode(value) && isPlainObject(value) && value.type === "doc",
    { message: "Lesson content must be a safe Tiptap document." },
  )
  .refine(isWithinLessonContentLimit, "Lesson content must be smaller than 1 MB.");

export interface TiptapLessonDocument {
  [key: string]: unknown;
  type: "doc";
  content: unknown[];
}

/**
 * JSONB content remains permissive for existing legacy lesson documents.
 * It may be omitted or null while a course is a draft.
 * Newly authored Tiptap documents are additionally checked with
 * tiptapLessonDocumentSchema before persistence and on the rendering boundary.
 */
export const lessonContentSchema = z
  .record(z.string(), z.unknown())
  .refine(isWithinLessonContentLimit, "Lesson content must be smaller than 1 MB.")
  .refine(
    (content) =>
      content.type !== "doc" || tiptapLessonDocumentSchema.safeParse(content).success,
    "Tiptap lesson documents must use supported, safe nodes and attributes.",
  );

export const createTeacherLessonRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH),
    content: lessonContentSchema.optional(),
  })
  .strict();

export const updateTeacherLessonRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH).optional(),
    // null clears incomplete lesson content.
    content: lessonContentSchema.nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one lesson field to update.",
      });
    }
  });

export const teacherTopicLessonCollectionParamsSchema = z
  .object({
    courseId: z.uuid(),
    topicId: z.uuid(),
  })
  .strict();

export const teacherCourseTopicLessonParamsSchema = z
  .object({
    courseId: z.uuid(),
    topicId: z.uuid(),
    lessonId: z.uuid(),
  })
  .strict();

export const teacherLessonResponseSchema = z
  .object({
    id: z.uuid(),
    topicId: z.uuid(),
    title: z.string().trim().min(1).max(LESSON_TITLE_MAX_LENGTH),
    content: lessonContentSchema.nullable(),
    position: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const teacherLessonListResponseSchema = z
  .object({
    items: z.array(teacherLessonResponseSchema),
  })
  .strict()
  .superRefine(({ items }, context) => {
    for (let index = 1; index < items.length; index += 1) {
      if (items[index - 1].position >= items[index].position) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "position"],
          message: "Lessons must be ordered by ascending position.",
        });
      }
    }
  });

/** Complete ordered lesson IDs for one topic; positions remain server-owned. */
export const reorderTeacherLessonsRequestSchema = z
  .object({
    lessonIds: z.array(z.uuid()),
  })
  .strict()
  .superRefine(({ lessonIds }, context) => {
    if (new Set(lessonIds).size !== lessonIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lessonIds"],
        message: "Lesson IDs must not contain duplicates.",
      });
    }
  });

export type LessonContent = z.infer<typeof lessonContentSchema>;
export type CreateTeacherLessonRequest = z.infer<
  typeof createTeacherLessonRequestSchema
>;
export type UpdateTeacherLessonRequest = z.infer<
  typeof updateTeacherLessonRequestSchema
>;
export type TeacherTopicLessonCollectionParams = z.infer<
  typeof teacherTopicLessonCollectionParamsSchema
>;
export type TeacherCourseTopicLessonParams = z.infer<
  typeof teacherCourseTopicLessonParamsSchema
>;
export type TeacherLessonResponse = z.infer<typeof teacherLessonResponseSchema>;
export type TeacherLessonListResponse = z.infer<
  typeof teacherLessonListResponseSchema
>;
export type ReorderTeacherLessonsRequest = z.infer<
  typeof reorderTeacherLessonsRequestSchema
>;
