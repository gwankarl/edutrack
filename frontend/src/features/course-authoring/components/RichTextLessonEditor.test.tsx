import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import RichTextLessonEditor from "./RichTextLessonEditor.js";

beforeAll(() => {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => document.body,
  });
});

describe("RichTextLessonEditor", () => {
  it("exposes accessible formatting controls and reports structured document updates", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextLessonEditor
        onChange={onChange}
        value={{ type: "doc", content: [] }}
      />,
    );

    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Paragraph and headings" }),
    ).toBeVisible();
    expect(screen.getByRole("group", { name: "Equations" })).toBeVisible();
    const editor = await screen.findByRole("textbox", { name: "Lesson content" });
    expect(editor).toBeVisible();
    await user.type(editor, "Algebra");
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Underline" }));
    expect(screen.getByRole("button", { name: "Underline" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain('"type":"bold"');
    expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain('"type":"underline"');
  });

  it("inserts, edits, and removes an inline equation through MathLive", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextLessonEditor
        onChange={onChange}
        value={{ type: "doc", content: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Insert inline equation" }));
    expect(screen.getByRole("dialog", { name: "Insert equation" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "LaTeX source" }), "x+2=5");
    await user.click(screen.getByRole("button", { name: "Save equation" }));

    await waitFor(() =>
      expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain(
        '"latex":"x+2=5"',
      ),
    );

    const mathNode = document.querySelector('[data-type="inline-math"]');
    expect(mathNode).not.toBeNull();
    await user.click(mathNode!);
    expect(screen.getByRole("dialog", { name: "Edit equation" })).toBeVisible();
    const latexInput = screen.getByRole("textbox", { name: "LaTeX source" });
    await user.clear(latexInput);
    await user.type(latexInput, "x+3=5");
    await user.click(screen.getByRole("button", { name: "Save equation" }));
    await waitFor(() =>
      expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain(
        '"latex":"x+3=5"',
      ),
    );

    const updatedNode = document.querySelector('[data-type="inline-math"]');
    expect(updatedNode).not.toBeNull();
    await user.click(updatedNode!);
    const removeButton = screen.getByRole("button", {
      name: "Remove selected equation",
    });
    await waitFor(() => expect(removeButton).toBeEnabled());
    await user.click(removeButton);
    await waitFor(() =>
      expect(JSON.stringify(onChange.mock.lastCall?.[0])).not.toContain(
        "inlineMath",
      ),
    );
  });

  it("does not enable editing controls in read-only mode", async () => {
    render(
      <RichTextLessonEditor
        disabled
        onChange={vi.fn()}
        value={{ type: "doc", content: [{ type: "paragraph" }] }}
      />,
    );

    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    expect(await screen.findByRole("textbox", { name: "Lesson content" })).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });

  it("inserts and edits a block equation using direct LaTeX input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextLessonEditor
        onChange={onChange}
        value={{ type: "doc", content: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Insert block equation" }));
    await user.type(screen.getByRole("textbox", { name: "LaTeX source" }), "a^2+b^2=c^2");
    await user.click(screen.getByRole("button", { name: "Save equation" }));

    await waitFor(() =>
      expect(JSON.stringify(onChange.mock.lastCall?.[0])).toContain('"latex":"a^2+b^2=c^2"'),
    );
    const equation = document.querySelector('[data-type="block-math"]');
    expect(equation).not.toBeNull();
    await user.click(equation!);
    expect(screen.getByRole("dialog", { name: "Edit equation" })).toBeVisible();
  });
});
