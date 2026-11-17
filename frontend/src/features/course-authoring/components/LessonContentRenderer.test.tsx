import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LessonContentRenderer from "./LessonContentRenderer.js";

describe("LessonContentRenderer", () => {
  it("renders legacy lesson blocks as text without interpreting HTML", () => {
    const { container } = render(
      <LessonContentRenderer
        content={{
          blocks: [
            { type: "paragraph", text: "Legacy lesson paragraph." },
            { type: "paragraph", text: "<script>window.compromised=true</script>" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Legacy lesson paragraph.")).toBeVisible();
    expect(screen.getByText("<script>window.compromised=true</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders structured mathematical content through KaTeX", () => {
    const { container } = render(
      <LessonContentRenderer
        content={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Solve " },
                { type: "inlineMath", attrs: { latex: "x+1=2" } },
              ],
            },
          ],
        }}
      />,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not render unsafe script or link nodes from malformed content", () => {
    const { container } = render(
      <LessonContentRenderer
        content={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "unsafe",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});
