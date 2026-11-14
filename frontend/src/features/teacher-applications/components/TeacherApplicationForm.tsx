import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  submitTeacherApplicationRequestSchema,
  type SubmitTeacherApplicationRequest,
} from "@edutrack/contracts";
import { ApiError } from "../../../lib/api/api-error.js";
import { useSubmitTeacherApplication } from "../hooks/useSubmitTeacherApplication.js";

type FieldName = keyof SubmitTeacherApplicationRequest;
type ServerFieldErrors = Partial<Record<FieldName, string>>;

const teacherApplicationFormSchema =
  submitTeacherApplicationRequestSchema.safeExtend({
    motivation: z
      .string()
      .trim()
      .min(1, "Enter why you want to become a teacher.")
      .max(5_000, "Use 5,000 characters or fewer."),
    qualifications: z
      .string()
      .trim()
      .min(1, "Enter your qualifications or relevant background.")
      .max(5_000, "Use 5,000 characters or fewer."),
  });

const fieldClassName =
  "min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

function getServerFieldErrors(error: unknown): ServerFieldErrors {
  if (!(error instanceof ApiError) || !Array.isArray(error.validationErrors)) {
    return {};
  }

  const fieldErrors: ServerFieldErrors = {};

  for (const item of error.validationErrors as unknown[]) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const issue = item as Record<string, unknown>;
    const field = issue.field;
    const message = issue.message;

    if (
      (field === "motivation" || field === "qualifications") &&
      typeof message === "string" &&
      fieldErrors[field] === undefined
    ) {
      fieldErrors[field] = message;
    }
  }

  return fieldErrors;
}

function getSubmissionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return "Please check the application details and try again.";
      case 401:
        return "Sign in before submitting a teacher application.";
      case 403:
        return "Your account is not currently eligible to apply.";
      case 409:
        return "You already have a pending application or the Teacher role.";
      default:
        return "We couldn't submit your application. Please try again.";
    }
  }

  return "We couldn't submit your application. Please try again.";
}

export default function TeacherApplicationForm() {
  const mutation = useSubmitTeacherApplication();
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubmitTeacherApplicationRequest>({
    resolver: zodResolver(teacherApplicationFormSchema),
    mode: "onBlur",
    defaultValues: {
      motivation: "",
      qualifications: "",
    },
  });

  const serverFieldErrors = getServerFieldErrors(mutation.error);
  const motivationError =
    errors.motivation?.message ?? serverFieldErrors.motivation;
  const qualificationsError =
    errors.qualifications?.message ?? serverFieldErrors.qualifications;
  const isBusy = isSubmitting || mutation.isPending;

  const submitForm = handleSubmit((values) => {
    setSubmitted(false);
    mutation.reset();
    mutation.mutate(values, {
      onSuccess: () => setSubmitted(true),
    });
  });

  return (
    <section
      aria-labelledby="teacher-application-heading"
      className="mx-auto w-full max-w-3xl space-y-6"
    >
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-primary">
          <AlertCircle aria-hidden="true" className="size-5" />
          <p className="text-sm font-semibold">Teacher application</p>
        </div>
        <h2
          className="text-2xl font-bold text-foreground"
          id="teacher-application-heading"
        >
          Tell us about your teaching interest
        </h2>
        <p className="text-sm text-muted-foreground">
          Share your motivation and relevant qualifications or background. Both
          responses are required.
        </p>
      </header>

      <form className="space-y-6" noValidate onSubmit={submitForm}>
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="teacher-application-motivation"
          >
            Motivation <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <p
            className="text-sm text-muted-foreground"
            id="teacher-application-motivation-help"
          >
            Explain why you want to support students as a teacher.
          </p>
          <textarea
            {...register("motivation")}
            aria-describedby={[
              "teacher-application-motivation-help",
              motivationError ? "teacher-application-motivation-error" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={Boolean(motivationError)}
            className={fieldClassName}
            id="teacher-application-motivation"
            maxLength={5_000}
            required
            rows={6}
          />
          <p className="text-right text-xs text-muted-foreground">
            Up to 5,000 characters
          </p>
          {motivationError && (
            <p
              className="text-sm text-danger"
              id="teacher-application-motivation-error"
              role="alert"
            >
              {motivationError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="teacher-application-qualifications"
          >
            Qualifications and background <span aria-hidden="true">*</span>
            <span className="sr-only"> (required)</span>
          </label>
          <p
            className="text-sm text-muted-foreground"
            id="teacher-application-qualifications-help"
          >
            Include relevant education, qualifications, or experience.
          </p>
          <textarea
            {...register("qualifications")}
            aria-describedby={[
              "teacher-application-qualifications-help",
              qualificationsError
                ? "teacher-application-qualifications-error"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={Boolean(qualificationsError)}
            className={fieldClassName}
            id="teacher-application-qualifications"
            maxLength={5_000}
            required
            rows={6}
          />
          <p className="text-right text-xs text-muted-foreground">
            Up to 5,000 characters
          </p>
          {qualificationsError && (
            <p
              className="text-sm text-danger"
              id="teacher-application-qualifications-error"
              role="alert"
            >
              {qualificationsError}
            </p>
          )}
        </div>

        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={isBusy}
          type="submit"
        >
          {mutation.isPending && (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          )}
          {mutation.isPending
            ? "Submitting application..."
            : "Submit application"}
        </button>

        {mutation.isError && (
          <p aria-live="polite" className="text-sm text-danger" role="alert">
            {getSubmissionErrorMessage(mutation.error)}
          </p>
        )}

        {submitted && (
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-success"
            role="status"
          >
            <CheckCircle2 aria-hidden="true" className="size-5" />
            Your application was submitted successfully.
          </p>
        )}
      </form>
    </section>
  );
}
