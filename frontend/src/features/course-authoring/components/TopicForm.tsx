import {
  TOPIC_DESCRIPTION_MAX_LENGTH,
  TOPIC_TITLE_MAX_LENGTH,
  createTeacherTopicRequestSchema,
  updateTeacherTopicRequestSchema,
  type CreateTeacherTopicRequest,
  type TeacherTopicResponse,
} from "@edutrack/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useCreateTopic, useUpdateTopic } from "../hooks/useTopicMutations.js";

const topicFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a topic title.")
      .max(TOPIC_TITLE_MAX_LENGTH, "The title is too long."),
    description: z
      .string()
      .max(
        TOPIC_DESCRIPTION_MAX_LENGTH,
        `Description must be ${TOPIC_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      ),
  })
  .transform(({ description, ...fields }) => ({
    ...fields,
    ...(description.trim() ? { description: description.trim() } : {}),
  }))
  .pipe(createTeacherTopicRequestSchema);

type TopicFormInput = z.input<typeof topicFormSchema>;
type TopicFormOutput = CreateTeacherTopicRequest;

export interface TopicFormProps {
  courseId: string;
  initialTopic?: TeacherTopicResponse;
  onCreated?: (topic: TeacherTopicResponse) => void;
  onUpdated?: (topic: TeacherTopicResponse) => void;
}

const fieldClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";

function safeTopicErrorMessage(error: unknown, editing: boolean): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;

    if (status === 401) {
      return "Your session has expired. Sign in again before managing topics.";
    }
    if (status === 403) {
      return "An active Teacher account is required to manage this course.";
    }
    if (status === 404) {
      return "This course or topic is no longer available. Refresh and try again.";
    }
    if (status === 409) {
      return "This course is no longer a draft, so its topics cannot be changed. Refresh the page.";
    }
    if (status === 400) {
      return "Please check the topic details and try again.";
    }
  }

  return editing
    ? "We couldn't save your topic changes. Please try again."
    : "We couldn't create this topic. Please try again.";
}

export default function TopicForm({
  courseId,
  initialTopic,
  onCreated,
  onUpdated,
}: TopicFormProps) {
  const createTopic = useCreateTopic(courseId);
  const updateTopic = useUpdateTopic(courseId, initialTopic?.id);
  const isEditing = initialTopic !== undefined;
  const initializedTopicId = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TopicFormInput, unknown, TopicFormOutput>({
    resolver: zodResolver(topicFormSchema),
    mode: "onBlur",
    defaultValues: { title: "", description: "" },
  });

  useEffect(() => {
    if (
      initialTopic &&
      initializedTopicId.current !== initialTopic.id
    ) {
      reset({
        title: initialTopic.title,
        description: initialTopic.description ?? "",
      });
      initializedTopicId.current = initialTopic.id;
    }
  }, [initialTopic, reset]);

  const mutation = isEditing ? updateTopic : createTopic;
  const isBusy = isSubmitting || mutation.isPending;

  function submitTopic(values: TopicFormOutput) {
    createTopic.reset();
    updateTopic.reset();

    if (initialTopic) {
      const input = updateTeacherTopicRequestSchema.parse({
        ...values,
        description: values.description ?? null,
      });
      updateTopic.mutate(
        { input },
        { onSuccess: (topic) => onUpdated?.(topic) },
      );
      return;
    }

    createTopic.mutate(values, {
      onSuccess: (topic) => onCreated?.(topic),
    });
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={handleSubmit(submitTopic)}
    >
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="topic-title"
        >
          Topic title{" "}
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        </label>
        <input
          {...register("title")}
          aria-describedby={errors.title ? "topic-title-error" : undefined}
          aria-invalid={Boolean(errors.title)}
          className={fieldClassName}
          disabled={isBusy}
          id="topic-title"
          maxLength={TOPIC_TITLE_MAX_LENGTH}
          required
        />
        {errors.title?.message && (
          <p className="text-sm text-danger" id="topic-title-error" role="alert">
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="topic-description"
        >
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          {...register("description")}
          aria-describedby={
            errors.description
              ? "topic-description-help topic-description-error"
              : "topic-description-help"
          }
          aria-invalid={Boolean(errors.description)}
          className={`${fieldClassName} min-h-32 resize-y`}
          disabled={isBusy}
          id="topic-description"
          maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
          rows={5}
        />
        <p
          className="text-sm text-muted-foreground"
          id="topic-description-help"
        >
          Add a short overview of this topic. Maximum {TOPIC_DESCRIPTION_MAX_LENGTH} characters.
        </p>
        {errors.description?.message && (
          <p
            className="text-sm text-danger"
            id="topic-description-error"
            role="alert"
          >
            {errors.description.message}
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
            ? "Saving changes..."
            : "Creating topic..."
          : isEditing
            ? "Save changes"
            : "Create topic"}
      </button>

      {mutation.isError && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-danger"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {safeTopicErrorMessage(mutation.error, isEditing)}
        </p>
      )}
      {mutation.isSuccess && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          {isEditing ? "Topic changes saved." : "Topic created."}
        </p>
      )}
    </form>
  );
}
