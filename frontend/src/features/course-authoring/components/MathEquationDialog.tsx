import { createElement, useEffect, useRef, useState } from "react";
import type { FormEvent, FormEventHandler } from "react";
import "mathlive";

export type MathEquationKind = "inline" | "block";

interface MathEquationDialogProps {
  initialLatex: string;
  kind: MathEquationKind;
  onCancel: () => void;
  onSave: (latex: string, kind: MathEquationKind) => void;
}

type MathFieldHandle = HTMLElement & {
  value: string;
  mathVirtualKeyboardPolicy: "manual" | "auto";
  focus: () => void;
};

type MathVirtualKeyboardWindow = Window & {
  mathVirtualKeyboard?: { show: () => void; hide: () => void };
};

const fieldClassName =
  "min-h-12 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function MathEquationDialog({
  initialLatex,
  kind,
  onCancel,
  onSave,
}: MathEquationDialogProps) {
  const mathFieldRef = useRef<MathFieldHandle | null>(null);
  const [latex, setLatex] = useState(initialLatex);
  const [error, setError] = useState<string | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const mathField = mathFieldRef.current;
    if (mathField) {
      mathField.value = initialLatex;
      mathField.mathVirtualKeyboardPolicy = "manual";
      mathField.focus();
    }

    return () => {
      (window as MathVirtualKeyboardWindow).mathVirtualKeyboard?.hide();
      previousFocus.current?.focus();
    };
  }, [initialLatex]);

  useEffect(() => {
    if (mathFieldRef.current && mathFieldRef.current.value !== latex) {
      mathFieldRef.current.value = latex;
    }
  }, [latex]);

  function saveEquation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLatex = latex.trim();
    if (!normalizedLatex) {
      setError("Enter a mathematical expression.");
      return;
    }
    if (normalizedLatex.length > 10_000) {
      setError("The expression is too long.");
      return;
    }

    onSave(normalizedLatex, kind);
  }

  return (
    <div
      aria-labelledby="math-equation-heading"
      aria-describedby="math-equation-description"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/50 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Tab") {
          const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), math-field, [tabindex]:not([tabindex="-1"])',
          );
          const first = focusable.item(0);
          const last = focusable.item(focusable.length - 1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
      role="dialog"
    >
      <form
        className="w-full max-w-2xl space-y-5 rounded-xl border border-border bg-background p-5 shadow-xl sm:p-7"
        onSubmit={saveEquation}
      >
        <header className="space-y-1">
          <h2
            className="text-xl font-semibold text-foreground"
            id="math-equation-heading"
          >
            {initialLatex ? "Edit equation" : "Insert equation"}
          </h2>
          <p className="text-sm text-muted-foreground" id="math-equation-description">
            Enter an expression visually or edit its LaTeX source.
          </p>
        </header>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="math-visual-input"
          >
            Visual equation input
          </label>
          {/** MathLive is a custom element; createElement avoids requiring a JSX global tag declaration. */}
          {createElement("math-field", {
            "aria-label": "Visual mathematical equation input",
            className: `${fieldClassName} min-h-16 text-lg`,
            id: "math-visual-input",
            onInput: ((event: FormEvent<HTMLElement>) => {
              setLatex((event.currentTarget as MathFieldHandle).value);
              setError(null);
            }) as FormEventHandler<HTMLElement>,
            ref: (element: HTMLElement | null) => {
              mathFieldRef.current = element as MathFieldHandle | null;
            },
          })}
          <button
            className="min-h-10 rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
            onClick={() =>
              (window as MathVirtualKeyboardWindow).mathVirtualKeyboard?.show()
            }
            type="button"
          >
            Open math keyboard
          </button>
        </div>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="math-latex-input"
          >
            LaTeX source
          </label>
          <textarea
            className={`${fieldClassName} min-h-24 resize-y font-mono text-sm`}
            id="math-latex-input"
            maxLength={10_000}
            onChange={(event) => {
              setLatex(event.currentTarget.value);
              setError(null);
            }}
            value={latex}
          />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            className="min-h-11 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-focus"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-11 rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-focus"
            type="submit"
          >
            Save equation
          </button>
        </div>
      </form>
    </div>
  );
}
