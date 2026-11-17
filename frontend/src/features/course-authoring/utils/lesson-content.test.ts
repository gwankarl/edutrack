import { describe, expect, it } from "vitest";

import { lessonContentToTiptap } from "./lesson-content.js";

describe("lesson content serialization", () => {
  it("preserves valid Tiptap JSON documents", () => {
    const document = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "New lesson" }] },
      ],
    };

    expect(lessonContentToTiptap(document)).toEqual(document);
  });

  it("converts legacy blocks into text-only paragraphs", () => {
    expect(
      lessonContentToTiptap({
        blocks: [
          { type: "paragraph", text: "First paragraph" },
          { type: "paragraph", text: "Second paragraph" },
        ],
      }),
    ).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
      ],
    });
  });

  it("keeps malformed legacy content inert and empty", () => {
    expect(
      lessonContentToTiptap({ html: "<script>alert(1)</script>" }),
    ).toEqual({ type: "doc", content: [] });
  });
});
