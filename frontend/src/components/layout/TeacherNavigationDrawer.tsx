import { useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import TeacherSidebar from "./TeacherSidebar.js";

interface TeacherNavigationDrawerProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export default function TeacherNavigationDrawer({
  open,
  onClose,
  triggerRef,
}: TeacherNavigationDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const appRoot = document.getElementById("root");
    const previouslyInert = appRoot?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (appRoot) {
      appRoot.inert = true;
    }
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeIfDesktop(event: UIEvent) {
      if ((event.currentTarget as Window).innerWidth >= 1024) {
        onClose();
      }
    }

    window.addEventListener("resize", closeIfDesktop);

    return () => {
      window.removeEventListener("resize", closeIfDesktop);

      if (appRoot) {
        appRoot.inert = previouslyInert;
      }
      document.body.style.overflow = previousOverflow;

      const focusTarget = triggerRef.current?.isConnected
        ? triggerRef.current
        : document.getElementById("main-content");

      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus();
      } else {
        previouslyFocused?.focus();
      }
    };
  }, [open, onClose, triggerRef]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    );
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInside = dialog.contains(activeElement);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey && (activeElement === first || !focusIsInside)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (activeElement === last || !focusIsInside)) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        aria-label="Close Teacher navigation backdrop"
        className="absolute inset-0 bg-foreground/50"
        onClick={onClose}
        type="button"
      />

      <section
        id="teacher-navigation-dialog"
        aria-labelledby="teacher-navigation-dialog-heading"
        aria-modal="true"
        className="absolute inset-y-0 left-0 z-10 flex w-[min(22rem,calc(100vw-3rem))] flex-col gap-4 overflow-y-auto border-r border-border bg-background p-4 shadow-xl"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-lg font-semibold text-foreground"
            id="teacher-navigation-dialog-heading"
          >
            Teacher navigation
          </h2>
          <button
            aria-label="Close Teacher navigation"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <TeacherSidebar
          className="w-full rounded-lg border border-border bg-surface p-4"
          onNavigate={onClose}
        />
      </section>
    </div>,
    document.body,
  );
}
