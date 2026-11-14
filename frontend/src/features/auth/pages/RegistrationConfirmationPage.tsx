import { MailCheck } from "lucide-react";
import { Link, useLocation } from "react-router";

function getRegisteredEmail(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("email" in state)) {
    return undefined;
  }

  return typeof state.email === "string" && state.email.trim().length > 0
    ? state.email
    : undefined;
}

export default function RegistrationConfirmationPage() {
  const location = useLocation();
  const email = getRegisteredEmail(location.state);

  return (
    <section
      aria-labelledby="registration-confirmation-heading"
      className="mx-auto max-w-xl space-y-6 rounded-lg border border-border bg-surface p-5 text-center shadow-sm sm:p-8"
    >
      <MailCheck
        aria-hidden="true"
        className="mx-auto size-12 text-primary"
        strokeWidth={1.75}
      />

      <div className="space-y-3">
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="registration-confirmation-heading"
        >
          Check your email
        </h1>

        <p
          aria-live="polite"
          className="text-sm leading-6 text-muted-foreground"
          role="status"
        >
          Your account was created. Follow the verification link we sent to your
          email to finish setting up your account.
        </p>

        {email && (
          <p className="wrap-break-word font-medium text-foreground">{email}</p>
        )}
      </div>

      <nav aria-label="Registration next steps">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 py-2 font-semibold text-primary hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/register"
        >
          Return to registration
        </Link>
      </nav>
    </section>
  );
}
