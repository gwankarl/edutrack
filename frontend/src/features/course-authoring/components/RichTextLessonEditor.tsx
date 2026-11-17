import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { type LessonContent } from "@edutrack/contracts";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Sigma,
  SquareFunction,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";

import MathEquationDialog, {
  type MathEquationKind,
} from "./MathEquationDialog.js";
import { lessonContentToTiptap } from "../utils/lesson-content.js";
import { createLessonEditorExtensions } from "../utils/lesson-editor-extensions.js";

interface EquationTarget {
  kind: MathEquationKind;
  position: number | null;
  latex: string;
}

export interface RichTextLessonEditorProps {
  value: LessonContent | null;
  onChange: (content: LessonContent) => void;
  disabled?: boolean;
  describedBy?: string;
}

const toolbarButtonClassName =
  "inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-info-surface";

export default function RichTextLessonEditor({
  value,
  onChange,
  disabled = false,
  describedBy,
}: RichTextLessonEditorProps) {
  const [equationTarget, setEquationTarget] =
    useState<EquationTarget | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const isLocalUpdate = useRef(false);
  const onChangeRef = useRef(onChange);
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const extensions = useMemo(
    () =>
      createLessonEditorExtensions((kind, position, latex) =>
        {
          editorRef.current?.commands.setNodeSelection(position);
          setEquationTarget({ kind, position, latex });
        },
      ),
    [],
  );
  const editor = useEditor({
    extensions,
    content: lessonContentToTiptap(value) as unknown as JSONContent,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      isLocalUpdate.current = true;
      onChangeRef.current(currentEditor.getJSON() as LessonContent);
    },
    editorProps: {
      attributes: {
        id: "lesson-content",
        "aria-label": "Lesson content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-describedby": describedBy ?? "",
        class:
          "prose prose-slate mx-auto min-h-80 w-full max-w-4xl rounded-b-md border-t border-border bg-background px-5 py-8 text-base leading-8 text-foreground focus:outline-none [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:text-2xl [&_h3]:mt-6 [&_h3]:text-xl [&_img]:mx-auto [&_img]:max-h-[32rem] [&_img]:rounded-md [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:p-2",
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  const activeControls = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      paragraph: currentEditor?.isActive("paragraph") ?? false,
      heading2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      heading3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      underline: currentEditor?.isActive("underline") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      subscript: currentEditor?.isActive("subscript") ?? false,
      superscript: currentEditor?.isActive("superscript") ?? false,
      inlineMath: currentEditor?.isActive("inlineMath") ?? false,
      blockMath: currentEditor?.isActive("blockMath") ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      canRedo: currentEditor?.can().redo() ?? false,
    }),
  }) ?? {
    paragraph: false,
    heading2: false,
    heading3: false,
    bold: false,
    italic: false,
    underline: false,
    bulletList: false,
    orderedList: false,
    subscript: false,
    superscript: false,
    inlineMath: false,
    blockMath: false,
    canUndo: false,
    canRedo: false,
  };

  useEffect(() => {
    if (!editor) return;
    if (isLocalUpdate.current) {
      isLocalUpdate.current = false;
      return;
    }

    const incoming = lessonContentToTiptap(value) as unknown as JSONContent;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function addLink() {
    if (!editor) return;
    const href = linkUrl.trim();
    try {
      const url = new URL(href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error("unsupported link");
      }
    } catch {
      setLinkError("Enter a complete HTTP or HTTPS link.");
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setLinkUrl("");
    setLinkError(null);
  }

  function saveEquation(latex: string, kind: MathEquationKind) {
    if (!editor || !equationTarget) return;
    const chain = editor.chain().focus();
    if (equationTarget.position !== null) {
      chain.setNodeSelection(equationTarget.position);
      if (kind === "inline") chain.updateInlineMath({ latex });
      else chain.updateBlockMath({ latex });
    } else if (kind === "inline") {
      chain.insertInlineMath({ latex });
    } else {
      chain.insertBlockMath({ latex });
    }
    chain.run();
    setEquationTarget(null);
  }

  return (
    <section
      aria-label="Lesson content editor"
      className="overflow-hidden rounded-md border border-border bg-background"
    >
      {editor && !disabled && (
        <div
          aria-label="Text formatting"
          className="flex flex-col gap-2 border-b border-border bg-surface p-3 sm:flex-row sm:flex-wrap"
          role="toolbar"
        >
          <div aria-label="Paragraph and headings" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Paragraph"
            aria-pressed={activeControls.paragraph}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="Paragraph"
            type="button"
          >
            Paragraph
          </button>
          <button
            aria-label="Heading level 2"
            aria-pressed={activeControls.heading2}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading level 2"
            type="button"
          >
            <Heading2 aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Heading level 3"
            aria-pressed={activeControls.heading3}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading level 3"
            type="button"
          >
            <Heading3 aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Text style" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Bold"
            aria-pressed={activeControls.bold}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
            type="button"
          >
            <Bold aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Italic"
            aria-pressed={activeControls.italic}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
            type="button"
          >
            <Italic aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Underline"
            aria-pressed={activeControls.underline}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
            type="button"
          >
            <UnderlineIcon aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Lists" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Bulleted list"
            aria-pressed={activeControls.bulletList}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bulleted list"
            type="button"
          >
            <List aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Numbered list"
            aria-pressed={activeControls.orderedList}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
            type="button"
          >
            <ListOrdered aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Script style" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Superscript"
            aria-pressed={activeControls.superscript}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            title="Superscript"
            type="button"
          >
            <SuperscriptIcon aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Subscript"
            aria-pressed={activeControls.subscript}
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            title="Subscript"
            type="button"
          >
            <SubscriptIcon aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Links" className="flex flex-wrap items-center gap-2" role="group">
          <label className="sr-only" htmlFor="lesson-link-url">
            Link URL
          </label>
          <input
            className="min-h-10 w-48 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-focus"
            id="lesson-link-url"
            onChange={(event) => setLinkUrl(event.currentTarget.value)}
            placeholder="https://…"
            type="url"
            value={linkUrl}
          />
          <button
            aria-label="Add link to selected text"
            className={toolbarButtonClassName}
            disabled={!linkUrl.trim()}
            onClick={addLink}
            title="Add link to selected text"
            type="button"
          >
            <Link2 aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Tables" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Insert table"
            className={toolbarButtonClassName}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
            }
            type="button"
            title="Insert table"
          >
            <Table2 aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Delete selected table"
            className={toolbarButtonClassName}
            disabled={!editor.isActive("table")}
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="Delete selected table"
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="Equations" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Insert inline equation"
            className={toolbarButtonClassName}
            onClick={() =>
              setEquationTarget({ kind: "inline", position: null, latex: "" })
            }
            title="Insert inline equation"
            type="button"
          >
            <Sigma aria-hidden="true" className="size-4" />
            Inline equation
          </button>
          <button
            aria-label="Insert block equation"
            className={toolbarButtonClassName}
            onClick={() =>
              setEquationTarget({ kind: "block", position: null, latex: "" })
            }
            title="Insert block equation"
            type="button"
          >
            <SquareFunction aria-hidden="true" className="size-4" />
            Block equation
          </button>
          <button
            aria-label="Remove selected equation"
            className={toolbarButtonClassName}
            disabled={!activeControls.inlineMath && !activeControls.blockMath}
            onClick={() => editor.chain().focus().deleteSelection().run()}
            title="Remove selected equation"
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove equation
          </button>
          <button
            aria-label="Insert horizontal rule"
            className={toolbarButtonClassName}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Insert horizontal rule"
            type="button"
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          </div>
          <div aria-label="History" className="flex flex-wrap gap-2" role="group">
          <button
            aria-label="Undo"
            className={toolbarButtonClassName}
            disabled={!activeControls.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
            title="Undo"
            type="button"
          >
            <Undo2 aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Redo"
            className={toolbarButtonClassName}
            disabled={!activeControls.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
            title="Redo"
            type="button"
          >
            <Redo2 aria-hidden="true" className="size-4" />
          </button>
          </div>
          {linkError && (
            <p className="basis-full text-sm text-danger" role="alert">
              {linkError}
            </p>
          )}
        </div>
      )}

      <EditorContent editor={editor} />
      {equationTarget && (
        <MathEquationDialog
          initialLatex={equationTarget.latex}
          kind={equationTarget.kind}
          onCancel={() => setEquationTarget(null)}
          onSave={saveEquation}
        />
      )}
    </section>
  );
}
