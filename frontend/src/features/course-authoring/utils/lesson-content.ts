import {
  tiptapLessonDocumentSchema,
  type LessonContent,
  type TiptapLessonDocument,
} from "@edutrack/contracts";

type TiptapTextNode = { type: "text"; text: string };
type TiptapParagraph = { type: "paragraph"; content?: TiptapTextNode[] };

const emptyDocument: TiptapLessonDocument = { type: "doc", content: [] };

function paragraph(text: string): TiptapParagraph {
  return {
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Convert current Tiptap documents and the former text/block formats safely. */
export function lessonContentToTiptap(
  content: LessonContent | null | undefined,
): TiptapLessonDocument {
  if (!content) return emptyDocument;

  const parsed = tiptapLessonDocumentSchema.safeParse(content);
  if (parsed.success) return parsed.data;

  const legacyText: string[] = [];
  if (typeof content.text === "string") legacyText.push(content.text);
  if (Array.isArray(content.blocks)) {
    for (const block of content.blocks) {
      if (isRecord(block) && typeof block.text === "string") {
        legacyText.push(block.text);
      }
    }
  }

  return {
    type: "doc",
    content: legacyText
      .flatMap((text) => text.split(/\r?\n\s*\r?\n/))
      .map((text) => paragraph(text)),
  };
}

/** Returns a bounded, schema-checked editor document or null for empty input. */
export function validateTiptapLessonContent(
  content: unknown,
): TiptapLessonDocument | null {
  const parsed = tiptapLessonDocumentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}
