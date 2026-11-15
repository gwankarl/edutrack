import { useEffect, useRef, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH,
  approveTeacherApplicationRequestSchema,
  rejectTeacherApplicationRequestSchema,
  type AdminTeacherApplicationResponse,
} from "@edutrack/contracts";
import { Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError } from "../../../../lib/api/api-error.js";
import { useTeacherApplicationDecision } from "../hooks/useTeacherApplicationDecision.js";

const decisionFormSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    rejectionReason: z
      .string()
      .max(ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH)
      .optional(),
    reviewNotes: z
      .string()
      .max(ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH)
      .optional(),
  })
  .superRefine((values, context) => {
    const reviewNotes = values.reviewNotes?.trim();
    const optionalNotes = reviewNotes ? { reviewNotes } : {};

    const result =
      values.decision === "approve"
        ? approveTeacherApplicationRequestSchema.safeParse(optionalNotes)
        : rejectTeacherApplicationRequestSchema.safeParse({
            ...optionalNotes,
            ...(values.rejectionReason === undefined
              ? {}
              : { rejectionReason: values.rejectionReason }),
          });

    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

type DecisionFormValues = z.input<typeof decisionFormSchema>;
type DecisionStatus = AdminTeacherApplicationResponse["status"];
type DecisionAction = DecisionFormValues["decision"];

const fieldClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "We couldn't submit this decision. Please try again.";
  }

  switch (error.status) {
    case 400:
      return "Please check the decision details and try again.";
    case 401:
      return "Your session may have expired. Sign in again to continue.";
    case 403:
      return "You no longer have permission to review this application.";
    case 404:
      return "This application could not be found.";
    case 409:
      return "Another administrator may have already reviewed this application. Refresh its details before continuing.";
    default:
      return "We couldn't submit this decision. Please try again.";
  }
}

export interface TeacherApplicationDecisionFormProps {
  applicationId: string;
  applicationStatus: DecisionStatus;
  onConflict?: () => void;
}

export default function TeacherApplicationDecisionForm({
  applicationId,
  applicationStatus,
  onConflict,
}: TeacherApplicationDecisionFormProps) {
  const decisionMutation = useTeacherApplicationDecision();
  const [selectedDecision, setSelectedDecision] =
    useState<DecisionAction | null>(null);
  const [confirmationValues, setConfirmationValues] =
    useState<DecisionFormValues | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelDialogButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDialogButtonRef = useRef<HTMLButtonElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);

  const {
    clearErrors,
    handleSubmit,
    register,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionFormSchema),
    mode: "onSubmit",
    defaultValues: {
      decision: "approve",
      rejectionReason: "",
      reviewNotes: "",
    },
  });

  const isBusy = isSubmitting || decisionMutation.isPending;

  useEffect(() => {
    if (!confirmationValues) {
      return;
    }

    const appRoot = document.getElementById("root");
    const wasInert = appRoot?.inert ?? false;
    const previouslyFocused = document.activeElement;
    if (appRoot) {
      appRoot.inert = true;
    }
    cancelDialogButtonRef.current?.focus();

    return () => {
      if (appRoot) {
        appRoot.inert = wasInert;
      }
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, [confirmationValues]);

  function chooseDecision(decision: DecisionAction) {
    decisionMutation.reset();
    clearErrors();
    reset({
      decision,
      rejectionReason: "",
      reviewNotes: "",
    });
    setValue("decision", decision);
    setSelectedDecision(decision);
  }

  function cancelDecision() {
    if (isBusy) {
      return;
    }

    decisionMutation.reset();
    clearErrors();
    reset({
      decision: "approve",
      rejectionReason: "",
      reviewNotes: "",
    });
    setSelectedDecision(null);
  }

  function submitForm(values: DecisionFormValues) {
    setConfirmationValues(values);
  }

  function closeConfirmation() {
    if (!isBusy) {
      setConfirmationValues(null);
      requestAnimationFrame(() => reviewButtonRef.current?.focus());
    }
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirmation();
      return;
    }

    if (event.key === "Tab") {
      const firstButton = cancelDialogButtonRef.current;
      const lastButton = confirmDialogButtonRef.current;

      if (
        event.shiftKey &&
        firstButton &&
        document.activeElement === firstButton
      ) {
        event.preventDefault();
        lastButton?.focus();
      } else if (
        !event.shiftKey &&
        lastButton &&
        document.activeElement === lastButton
      ) {
        event.preventDefault();
        firstButton?.focus();
      }
    }
  }

  async function confirmDecision() {
    if (!confirmationValues) {
      return;
    }

    const reviewNotes = confirmationValues.reviewNotes?.trim();
    const optionalNotes = reviewNotes ? { reviewNotes } : {};

    try {
      if (confirmationValues.decision === "approve") {
        const input =
          approveTeacherApplicationRequestSchema.parse(optionalNotes);
        await decisionMutation.submitDecision({
          decision: "approve",
          applicationId,
          input,
        });
      } else {
        const input = rejectTeacherApplicationRequestSchema.parse({
          ...optionalNotes,
          rejectionReason: confirmationValues.rejectionReason ?? "",
        });
        await decisionMutation.submitDecision({
          decision: "reject",
          applicationId,
          input,
        });
      }
    } catch {
      // The hook retains the safe error for display below.
    } finally {
      setConfirmationValues(null);
    }
  }

  if (decisionMutation.isSuccess) {
    const decisionLabel =
      decisionMutation.data?.status === "approved" ? "approved" : "rejected";

    return (
      <p
        aria-live="polite"
        className="flex items-start gap-2 rounded-md bg-success-surface p-4 text-success"
        role="status"
      >
        <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        Application {decisionLabel}. The application details and review list
        have been refreshed.
      </p>
    );
  }

  if (applicationStatus !== "pending") {
    return null;
  }

  return (
    <>
      <section
        aria-labelledby="teacher-application-decision-heading"
        className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
      >
        <header className="space-y-2">
          <h2
            className="text-xl font-semibold text-foreground"
            id="teacher-application-decision-heading"
          >
            Administrator decision
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Approving grants the Teacher role. Rejection records a reason.
            Either decision is final for this application.
          </p>
        </header>

        {!selectedDecision ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
              onClick={() => chooseDecision("approve")}
              type="button"
            >
              <Check aria-hidden="true" className="size-5" />
              Approve
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-danger px-4 py-2 font-semibold text-danger hover:bg-danger-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
              onClick={() => chooseDecision("reject")}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
              Reject
            </button>
          </div>
        ) : (
          <form
            className="space-y-5"
            noValidate
            onSubmit={handleSubmit(submitForm)}
          >
            <input type="hidden" {...register("decision")} />

            {selectedDecision === "reject" && (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="teacher-application-rejection-reason"
                >
                  Rejection reason <span aria-hidden="true">*</span>
                  <span className="sr-only"> (required)</span>
                </label>
                <p
                  className="text-sm text-muted-foreground"
                  id="teacher-application-rejection-reason-help"
                >
                  Give the applicant a clear reason for this decision.
                </p>
                <textarea
                  {...register("rejectionReason")}
                  aria-describedby={
                    errors.rejectionReason
                      ? "teacher-application-rejection-reason-help teacher-application-rejection-reason-error"
                      : "teacher-application-rejection-reason-help"
                  }
                  aria-invalid={Boolean(errors.rejectionReason)}
                  className={fieldClassName}
                  id="teacher-application-rejection-reason"
                  maxLength={ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH}
                  required
                  rows={5}
                />
                <p className="text-right text-xs text-muted-foreground">
                  Up to {ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH}{" "}
                  characters
                </p>
                {errors.rejectionReason?.message && (
                  <p
                    className="text-sm text-danger"
                    id="teacher-application-rejection-reason-error"
                    role="alert"
                  >
                    {errors.rejectionReason.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="teacher-application-review-notes"
              >
                Administrator review notes (optional)
              </label>
              <p
                className="text-sm text-muted-foreground"
                id="teacher-application-review-notes-help"
              >
                These notes are internal and are not shown to the applicant.
              </p>
              <textarea
                {...register("reviewNotes")}
                aria-describedby={
                  errors.reviewNotes
                    ? "teacher-application-review-notes-help teacher-application-review-notes-error"
                    : "teacher-application-review-notes-help"
                }
                aria-invalid={Boolean(errors.reviewNotes)}
                className={fieldClassName}
                id="teacher-application-review-notes"
                maxLength={ADMIN_TEACHER_APPLICATION_DECISION_TEXT_MAX_LENGTH}
                rows={4}
              />
              {errors.reviewNotes?.message && (
                <p
                  className="text-sm text-danger"
                  id="teacher-application-review-notes-error"
                  role="alert"
                >
                  {errors.reviewNotes.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                ref={reviewButtonRef}
                type="submit"
              >
                {isBusy && (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-5 animate-spin"
                  />
                )}
                {isBusy
                  ? selectedDecision === "approve"
                    ? "Submitting approval..."
                    : "Submitting rejection..."
                  : selectedDecision === "approve"
                    ? "Review approval"
                    : "Review rejection"}
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                onClick={cancelDecision}
                type="button"
              >
                Cancel
              </button>
            </div>

            {decisionMutation.isError && (
              <div
                aria-live="polite"
                className="space-y-3 rounded-md bg-danger-surface p-4 text-danger"
                role="alert"
              >
                <p>{getErrorMessage(decisionMutation.error)}</p>
                {decisionMutation.error instanceof ApiError &&
                  decisionMutation.error.status === 409 && (
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() => {
                        onConflict?.();
                        cancelDecision();
                      }}
                      type="button"
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                      Refresh application
                    </button>
                  )}
              </div>
            )}
          </form>
        )}
      </section>

      {confirmationValues &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              aria-describedby="teacher-application-confirmation-description"
              aria-labelledby="teacher-application-confirmation-heading"
              aria-modal="true"
              className="w-full max-w-lg space-y-5 rounded-lg border border-border bg-surface p-6 shadow-xl"
              onKeyDown={handleDialogKeyDown}
              ref={dialogRef}
              role="alertdialog"
              tabIndex={-1}
            >
              <div className="space-y-2">
                <h2
                  className="text-xl font-semibold text-foreground"
                  id="teacher-application-confirmation-heading"
                >
                  {confirmationValues.decision === "approve"
                    ? "Confirm application approval"
                    : "Confirm application rejection"}
                </h2>
                <p
                  className="text-sm leading-6 text-muted-foreground"
                  id="teacher-application-confirmation-description"
                >
                  {confirmationValues.decision === "approve"
                    ? "This will approve the application and grant the applicant the Teacher role. This decision cannot be undone."
                    : "This will reject the application and record the rejection reason. This decision cannot be undone."}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isBusy}
                  onClick={closeConfirmation}
                  ref={cancelDialogButtonRef}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isBusy}
                  onClick={() => void confirmDecision()}
                  ref={confirmDialogButtonRef}
                  type="button"
                >
                  {isBusy && (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  )}
                  {isBusy
                    ? "Submitting decision..."
                    : confirmationValues.decision === "approve"
                      ? "Approve application"
                      : "Reject application"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
