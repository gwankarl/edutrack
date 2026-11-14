import type { RegistrationRequest } from "@edutrack/contracts";
import { Link, useNavigate } from "react-router";

import { ApiError } from "../../../lib/api/api-error.js";
import RegistrationForm from "../components/RegistrationForm.js";
import { useRegistration } from "../hooks/useRegistration.js";

type RegistrationField = "displayName" | "email" | "password";
type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>;

function getFieldErrors(error: unknown): RegistrationFieldErrors {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return {};
  }

  const validationErrors = error.validationErrors;
  if (!Array.isArray(validationErrors)) {
    return {};
  }

  const fieldErrors: RegistrationFieldErrors = {};

  for (const issue of validationErrors) {
    if (typeof issue !== "object" || issue === null) {
      continue;
    }

    const { field, message } = issue as {
      field?: unknown;
      message?: unknown;
    };

    if (
      typeof field === "string" &&
      typeof message === "string" &&
      ["displayName", "email", "password"].includes(field)
    ) {
      fieldErrors[field as RegistrationField] = message;
    }
  }

  return fieldErrors;
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return "Registration could not be completed. If you already have an account, try signing in.";
  }

  if (error instanceof ApiError && error.status === 503) {
    return "Your account was created, but we couldn't send the verification email. Please contact support.";
  }

  return "We couldn't create your account. Please check your details and try again.";
}

export default function RegisterPage() {
  const registration = useRegistration();
  const navigate = useNavigate();
  const fieldErrors = getFieldErrors(registration.error);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  async function submitRegistration(
    values: RegistrationRequest,
  ): Promise<void> {
    try {
      const user = await registration.mutateAsync(values);

      navigate("/registration-confirmation", {
        replace: true,
        state: { email: user.email },
      });
    } catch {
      // Mutation state displays a safe message; do not log request data.
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-6 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Create your EduTrack account
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter your details to get started.
        </p>
      </div>

      <RegistrationForm
        errorMessage={
          registration.isError && !hasFieldErrors
            ? getSafeErrorMessage(registration.error)
            : undefined
        }
        fieldErrors={fieldErrors}
        isPending={registration.isPending}
        onSubmit={submitRegistration}
      />

      <nav
        aria-label="Account access"
        className="space-y-2 border-t border-border pt-4 text-sm"
      >
        <p>
          Already have an account?{" "}
          <Link
            className="font-medium text-primary hover:underline"
            to="/login"
          >
            Log in
          </Link>
        </p>
        <p>
          <Link
            className="font-medium text-primary hover:underline"
            to="/forgot-password"
          >
            Forgot your password?
          </Link>
        </p>
      </nav>
    </section>
  );
}
