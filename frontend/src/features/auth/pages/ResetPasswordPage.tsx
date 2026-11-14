import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import {
  resetPasswordRequestSchema,
  type ResetPasswordRequest,
} from "@edutrack/contracts";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { ApiError } from "../../../lib/api/api-error.js";
import { useResetPassword } from "../hooks/useResetPassword.js";

const resetPasswordFormSchema = resetPasswordRequestSchema
  .omit({ token: true })
  .extend({
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });

type ResetPasswordFormInput = z.input<typeof resetPasswordFormSchema>;
type ResetPasswordFormOutput = z.output<typeof resetPasswordFormSchema>;

const inputClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger";

function getServerPasswordError(error: unknown): string | undefined {
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

    if (field === "newPassword" && typeof message === "string") {
      return message;
    }
  }

  return undefined;
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const resetMutation = useResetPassword();

  const tokenRef = useRef<string | null>(null);
  const capturedRef = useRef(false);
  const preparedRef = useRef(false);
  const [tokenReady, setTokenReady] = useState(false);

  if (!capturedRef.current) {
    tokenRef.current = new URLSearchParams(location.search).get("token");
    capturedRef.current = true;
  }

  const tokenIsValid = resetPasswordRequestSchema
    .pick({ token: true })
    .safeParse({ token: tokenRef.current }).success;

  useEffect(() => {
    if (preparedRef.current) {
      return;
    }

    preparedRef.current = true;

    const searchParams = new URLSearchParams(location.search);
    const hadToken = searchParams.has("token");
    searchParams.delete("token");

    if (hadToken) {
      const remainingSearch = searchParams.toString();

      navigate(
        {
          pathname: location.pathname,
          search: remainingSearch ? `?${remainingSearch}` : "",
          hash: location.hash,
        },
        {
          replace: true,
          state: location.state,
        },
      );
    }

    setTokenReady(true);
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  const serverPasswordError = getServerPasswordError(resetMutation.error);
  const isInvalidToken =
    resetMutation.isError &&
    resetMutation.error instanceof ApiError &&
    resetMutation.error.status === 400 &&
    !serverPasswordError;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormInput, unknown, ResetPasswordFormOutput>({
    resolver: zodResolver(resetPasswordFormSchema),
    mode: "onBlur",
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function submitReset(values: ResetPasswordFormOutput): Promise<void> {
    const token = tokenRef.current;

    if (!token || !tokenIsValid) {
      return;
    }

    const request: ResetPasswordRequest = {
      token,
      newPassword: values.newPassword,
    };

    try {
      await resetMutation.mutateAsync(request);
    } catch {
      // Mutation state displays safe feedback; do not log token or password.
    }
  }

  const isBusy = isSubmitting || resetMutation.isPending;
  const passwordError = errors.newPassword?.message ?? serverPasswordError;

  let content;

  if (!tokenReady) {
    content = (
      <>
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto size-10 animate-spin text-primary"
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="reset-password-heading"
        >
          Preparing password reset
        </h1>
        <p className="text-sm text-muted-foreground" role="status">
          Please wait.
        </p>
      </>
    );
  } else if (!tokenIsValid || isInvalidToken) {
    content = (
      <>
        <CircleAlert
          aria-hidden="true"
          className="mx-auto size-10 text-danger"
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="reset-password-heading"
        >
          This reset link can’t be used
        </h1>
        <p className="text-sm leading-6 text-muted-foreground" role="alert">
          This link is invalid, expired, or has already been used. Reset links
          work once. Request a new password reset link to continue.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/forgot-password"
        >
          Request another reset link
        </Link>
      </>
    );
  } else if (resetMutation.isSuccess) {
    content = (
      <>
        <ShieldCheck
          aria-hidden="true"
          className="mx-auto size-10 text-success"
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="reset-password-heading"
        >
          Password reset
        </h1>
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          Your password has been updated. You can now log in with your new
          password.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Go to login
        </Link>
      </>
    );
  } else {
    content = (
      <>
        <KeyRound
          aria-hidden="true"
          className="size-10 text-primary"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="reset-password-heading"
        >
          Choose a new password
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Use a password between 12 and 128 characters.
        </p>

        <form
          className="space-y-5 text-left"
          noValidate
          onSubmit={handleSubmit(submitReset)}
        >
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="reset-password-new"
            >
              New password
            </label>
            <input
              {...register("newPassword")}
              autoComplete="new-password"
              className={inputClassName}
              id="reset-password-new"
              type="password"
              aria-describedby={
                passwordError ? "reset-password-new-error" : undefined
              }
              aria-invalid={Boolean(passwordError)}
            />
            {passwordError && (
              <p
                className="text-sm text-danger"
                id="reset-password-new-error"
                role="alert"
              >
                {passwordError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="reset-password-confirm"
            >
              Confirm new password
            </label>
            <input
              {...register("confirmPassword")}
              autoComplete="new-password"
              className={inputClassName}
              id="reset-password-confirm"
              type="password"
              aria-describedby={
                errors.confirmPassword
                  ? "reset-password-confirm-error"
                  : undefined
              }
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            {errors.confirmPassword?.message && (
              <p
                className="text-sm text-danger"
                id="reset-password-confirm-error"
                role="alert"
              >
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={isBusy}
            type="submit"
          >
            {isBusy ? "Updating password..." : "Reset password"}
          </button>

          {resetMutation.isError && !isInvalidToken && !serverPasswordError && (
            <p className="text-sm text-danger" role="alert">
              We couldn’t reset your password right now. Please try again later.
            </p>
          )}
        </form>
      </>
    );
  }

  return (
    <section
      aria-labelledby="reset-password-heading"
      className="mx-auto max-w-xl space-y-5 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <div className="space-y-4">{content}</div>
    </section>
  );
}
