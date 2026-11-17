import { Mathematics } from "@tiptap/extension-mathematics";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";

export type MathNodeKind = "inline" | "block";

function safeWebUrl(value: string): boolean {
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

/** One allow-listed extension set is used for both editing and preview. */
export function createLessonEditorExtensions(
  onMathClick?: (
    kind: MathNodeKind,
    position: number,
    latex: string,
  ) => void,
): Extensions {
  return [
    StarterKit.configure({ link: false }),
    Link.configure({
      autolink: false,
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      isAllowedUri: (url: string) => safeWebUrl(url),
    }),
    Image.configure({
      allowBase64: false,
      inline: false,
      HTMLAttributes: { loading: "lazy", referrerpolicy: "no-referrer" },
    }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: false } }),
    Mathematics.configure({
      inlineOptions: {
        onClick: (node, position) =>
          onMathClick?.("inline", position, String(node.attrs.latex ?? "")),
      },
      blockOptions: {
        onClick: (node, position) =>
          onMathClick?.("block", position, String(node.attrs.latex ?? "")),
      },
      katexOptions: {
        throwOnError: false,
        trust: false,
        strict: "ignore",
        maxExpand: 1_000,
        maxSize: 20,
      },
    }),
  ];
}
