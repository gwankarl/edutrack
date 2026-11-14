import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleAlert, Mail } from "lucide-react";
import {
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
} from "@edutrack/contracts";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";

import { ApiError } from "../../../lib/api/api-error.js";
import { useForgotPassword } from "../hooks/useForgotPassword.js";

type ForgotPasswordFormInput = z.input<typeof forgotPasswordRequestSchema>;
type ForgotPasswordFormOutput = z.output<typeof forgotPasswordRequestSchema>;

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

function getServerEmailError(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return undefined;
  }

  if (!Array.isArray(error.validationErrors)) {
    return undefined;
  }

  for (const issue of error.validationErrors) {
    if (typeof issue !== "object" || issue === null) {
      continue;
    }

    const { field, message } = issue as {
      field?: unknown;
      message?: unknown;
    };

    if (field === "email" && typeof message === "string") {
      return message;
    }
  }

  return undefined;
}

export default function ForgotPasswordPage() {
  const recovery = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormInput, unknown, ForgotPasswordFormOutput>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  const serverEmailError = getServerEmailError(recovery.error);
  const emailError = errors.email?.message ?? serverEmailError;
  const isBusy = isSubmitting || recovery.isPending;

  async function submitRequest(values: ForgotPasswordRequest): Promise<void> {
    try {
      await recovery.mutateAsync(values);
    } catch {
      // Mutation state shows a safe message; do not log submitted data.
    }
  }

  return (
    <section
      aria-labelledby="forgot-password-heading"
      className="mx-auto max-w-xl space-y-6 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <div className="space-y-3">
        <Mail
          aria-hidden="true"
          className="size-10 text-primary"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="forgot-password-heading"
        >
          Forgot your password?
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter the email address associated with your account. If an account
          exists, we’ll send instructions to reset its password.
        </p>
      </div>

      <form
        className="space-y-5"
        noValidate
        onSubmit={handleSubmit(submitRequest)}
      >
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="forgot-password-email"
          >
            Email
          </label>
          <input
            {...register("email")}
            autoComplete="email"
            className={inputClassName}
            id="forgot-password-email"
            type="email"
            aria-describedby={
              emailError ? "forgot-password-email-error" : undefined
            }
            aria-invalid={Boolean(emailError)}
          />
          {emailError && (
            <p
              className="text-sm text-danger"
              id="forgot-password-email-error"
              role="alert"
            >
              {emailError}
            </p>
          )}
        </div>

        <button
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={isBusy}
          type="submit"
        >
          {isBusy ? "Sending instructions..." : "Send reset instructions"}
        </button>

        {recovery.isError && !serverEmailError && (
          <p
            aria-live="polite"
            className="flex gap-2 text-sm text-danger"
            role="alert"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            We couldn’t process your request right now. Please try again later.
          </p>
        )}

        {recovery.isSuccess && (
          <p
            aria-live="polite"
            className="text-sm leading-6 text-success"
            role="status"
          >
            {recovery.data.message}
          </p>
        )}
      </form>

      <nav aria-label="Authentication navigation">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to login
        </Link>
      </nav>
    </section>
  );
}
