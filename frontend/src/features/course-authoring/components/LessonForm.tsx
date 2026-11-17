import {
  LESSON_TITLE_MAX_LENGTH,
  createTeacherLessonRequestSchema,
  tiptapLessonDocumentSchema,
  updateTeacherLessonRequestSchema,
  type LessonContent,
  type TeacherLessonResponse,
} from "@edutrack/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useCreateLesson, useUpdateLesson } from "../hooks/useLessonMutations.js";
import { lessonContentToTiptap } from "../utils/lesson-content.js";
import RichTextLessonEditor from "./RichTextLessonEditor.js";
import LessonContentRenderer from "./LessonContentRenderer.js";

const lessonFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a lesson title.")
    .max(LESSON_TITLE_MAX_LENGTH, "The title is too long."),
  content: tiptapLessonDocumentSchema,
});

type LessonFormInput = z.input<typeof lessonFormSchema>;
type LessonFormOutput = z.output<typeof lessonFormSchema>;

export interface LessonFormProps {
  courseId: string;
  topicId: string;
  initialLesson?: TeacherLessonResponse;
  onCreated?: (lesson: TeacherLessonResponse) => void;
  onUpdated?: (lesson: TeacherLessonResponse) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const fieldClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";

function safeLessonErrorMessage(error: unknown, editing: boolean): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;

    if (status === 401) {
      return "Your session has expired. Sign in again before managing lessons.";
    }
    if (status === 403) {
      return "An active Teacher account is required to manage this course.";
    }
    if (status === 404) {
      return "This course, topic, or lesson is no longer available. Refresh and try again.";
    }
    if (status === 409) {
      return "This course is no longer a draft, so its lessons cannot be changed. Refresh the page.";
    }
    if (status === 400) {
      return "Please check the lesson details and try again.";
    }
  }

  return editing
    ? "We couldn't save your lesson changes. Please try again."
    : "We couldn't create this lesson. Please try again.";
}

export default function LessonForm({
  courseId,
  topicId,
  initialLesson,
  onCreated,
  onUpdated,
  onDirtyChange,
}: LessonFormProps) {
  const createLesson = useCreateLesson(courseId, topicId);
  const updateLesson = useUpdateLesson(courseId, topicId, initialLesson?.id);
  const isEditing = initialLesson !== undefined;
  const initializedLessonId = useRef<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<LessonFormInput, unknown, LessonFormOutput>({
    resolver: zodResolver(lessonFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      content: lessonContentToTiptap(null),
    },
  });
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [saved, setSaved] = useState(false);
  const currentContent = watch("content");

  useEffect(() => {
    onDirtyChange?.(isDirty && !saved);
  }, [isDirty, onDirtyChange, saved]);

  useEffect(() => {
    if (initialLesson && initializedLessonId.current !== initialLesson.id) {
      reset({
        title: initialLesson.title,
        content: lessonContentToTiptap(initialLesson.content),
      });
      setContentMode("edit");
      initializedLessonId.current = initialLesson.id;
    }
  }, [initialLesson, reset]);

  const mutation = isEditing ? updateLesson : createLesson;
  const isBusy = isSubmitting || mutation.isPending;

  useEffect(() => {
    if (mutation.isSuccess) setSaved(true);
  }, [mutation.isSuccess]);

  async function submitLesson(values: LessonFormOutput) {
    setSaved(false);
    createLesson.reset();
    updateLesson.reset();
    // Tiptap's JSON document is an object and is stored directly in the JSONB column.
    const content = values.content as LessonContent;

    try {
      const lesson = initialLesson
        ? await updateLesson.mutateAsync({
            input: updateTeacherLessonRequestSchema.parse({
              title: values.title,
              content,
            }),
          })
        : await createLesson.mutateAsync(
            createTeacherLessonRequestSchema.parse({
              title: values.title,
              content,
            }),
          );

      reset({
        title: lesson.title,
        content: lessonContentToTiptap(lesson.content),
      });
      if (initialLesson) onUpdated?.(lesson);
      else onCreated?.(lesson);
      onDirtyChange?.(false);
    } catch {
      // The mutation state below presents a safe, user-facing error message.
    }
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={handleSubmit(submitLesson)}
    >
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="lesson-title"
        >
          Lesson title{" "}
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        </label>
        <input
          {...register("title", { onChange: () => setSaved(false) })}
          aria-describedby={errors.title ? "lesson-title-error" : undefined}
          aria-invalid={Boolean(errors.title)}
          className={fieldClassName}
          disabled={isBusy}
          id="lesson-title"
          maxLength={LESSON_TITLE_MAX_LENGTH}
          required
        />
        {errors.title?.message && (
          <p className="text-sm text-danger" id="lesson-title-error" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="lesson-content"
          id="lesson-content-label"
        >
          Lesson content{" "}
          <span className="font-normal text-muted-foreground">
            (optional while drafting)
          </span>
        </label>
        <div
          aria-label="Lesson content mode"
          className="inline-flex rounded-md border border-border p-1"
          role="tablist"
        >
          <button
            aria-controls="lesson-content-panel"
            aria-selected={contentMode === "edit"}
            className="min-h-10 rounded px-3 font-medium focus-visible:outline-2 focus-visible:outline-focus aria-selected:bg-primary aria-selected:text-inverse"
            id="lesson-edit-tab"
            onClick={() => setContentMode("edit")}
            role="tab"
            type="button"
          >
            Edit
          </button>
          <button
            aria-controls="lesson-content-panel"
            aria-selected={contentMode === "preview"}
            className="min-h-10 rounded px-3 font-medium focus-visible:outline-2 focus-visible:outline-focus aria-selected:bg-primary aria-selected:text-inverse"
            id="lesson-preview-tab"
            onClick={() => setContentMode("preview")}
            role="tab"
            type="button"
          >
            Preview
          </button>
        </div>
        <div
          aria-labelledby={contentMode === "edit" ? "lesson-edit-tab" : "lesson-preview-tab"}
          className="mt-3 rounded-md border border-border bg-background p-4 sm:p-6"
          id="lesson-content-panel"
          role="tabpanel"
          tabIndex={0}
        >
          <div hidden={contentMode !== "edit"}>
            <Controller
              control={control}
              name="content"
              render={({ field }) => (
                <RichTextLessonEditor
                  describedBy="lesson-content-help"
                  disabled={isBusy}
                  onChange={(content) => {
                    setSaved(false);
                    field.onChange(content);
                  }}
                  value={field.value as LessonContent}
                />
              )}
            />
          </div>
          {contentMode === "preview" && (
            <LessonContentRenderer content={currentContent as LessonContent} />
          )}
        </div>
        <p
          className="text-sm leading-6 text-muted-foreground"
          id="lesson-content-help"
        >
          Format lesson text, add tables and equations, or leave the content
          incomplete while the course is a draft. Content is saved as a
          structured document.
        </p>
        {typeof errors.content?.message === "string" && (
          <p className="text-sm text-danger" role="alert">
            {errors.content.message}
          </p>
        )}
      </div>

      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isBusy}
        type="submit"
      >
        {isBusy && (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        )}
        {isBusy
          ? isEditing
            ? "Saving lesson..."
            : "Creating lesson..."
          : isEditing
            ? "Save Lesson"
            : "Create Lesson"}
      </button>

      <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
        {isBusy
          ? "Saving lesson…"
          : saved
            ? isEditing
              ? "All changes saved"
              : "Lesson created."
            : isDirty
              ? "Unsaved changes"
              : isEditing
                ? "No unsaved changes"
                : "Complete the lesson details to save"}
      </p>

      {mutation.isError && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-danger"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {safeLessonErrorMessage(mutation.error, isEditing)}
        </p>
      )}
    </form>
  );
}
