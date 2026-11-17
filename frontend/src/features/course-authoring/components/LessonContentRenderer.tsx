import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { type LessonContent } from "@edutrack/contracts";
import { useEffect, useMemo } from "react";
import "katex/dist/katex.min.css";

import { createLessonEditorExtensions } from "../utils/lesson-editor-extensions.js";
import { lessonContentToTiptap } from "../utils/lesson-content.js";

export interface LessonContentRendererProps {
  content: LessonContent | null;
}

/** Read-only ProseMirror renderer; it never inserts API content as HTML. */
export default function LessonContentRenderer({
  content,
}: LessonContentRendererProps) {
  const extensions = useMemo(() => createLessonEditorExtensions(), []);
  const editor = useEditor({
    extensions,
    content: lessonContentToTiptap(content) as unknown as JSONContent,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none text-sm leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-6 [&_h2]:text-xl [&_h3]:mt-5 [&_h3]:text-lg [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:p-2",
        "aria-label": "Lesson content preview",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(
      lessonContentToTiptap(content) as unknown as JSONContent,
      {
      emitUpdate: false,
      },
    );
  }, [content, editor]);

  if (!content) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Lesson content has not been added yet.
      </p>
    );
  }

  return <EditorContent editor={editor} />;
}
