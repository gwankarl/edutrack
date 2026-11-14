import { useEffect, useRef } from "react";
import { CircleAlert, LoaderCircle, MailCheck } from "lucide-react";
import { verifyEmailRequestSchema } from "@edutrack/contracts";
import { Link, useLocation, useNavigate } from "react-router";

import { ApiError } from "../../../lib/api/api-error.js";
import { useEmailVerification } from "../hooks/useEmailVerification.js";

export default function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const verification = useEmailVerification();

  const tokenRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const startedRef = useRef(false);

  if (!initializedRef.current) {
    tokenRef.current = new URLSearchParams(location.search).get("token");
    initializedRef.current = true;
  }

  const tokenIsValid = verifyEmailRequestSchema.safeParse({
    token: tokenRef.current,
  }).success;

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

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

    if (tokenIsValid && tokenRef.current) {
      verification.mutate({ token: tokenRef.current });
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    tokenIsValid,
    verification.mutate,
  ]);

  const isInvalidToken =
    verification.error instanceof ApiError && verification.error.status === 400;

  let content;

  if (verification.isSuccess) {
    content = (
      <>
        <MailCheck
          aria-hidden="true"
          className="mx-auto size-12 text-success"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="verify-email-heading"
        >
          Email verified
        </h1>
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          Your email address is verified. You can now continue to log in.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Go to login
        </Link>
      </>
    );
  } else if (!tokenIsValid || isInvalidToken) {
    content = (
      <>
        <CircleAlert
          aria-hidden="true"
          className="mx-auto size-12 text-danger"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="verify-email-heading"
        >
          This verification link can’t be used
        </h1>
        <p className="text-sm leading-6 text-muted-foreground" role="alert">
          This link is invalid, expired, or has already been used. Verification
          links work once. If your email is still unverified, contact support
          for a new link.
        </p>
      </>
    );
  } else if (verification.isError) {
    content = (
      <>
        <CircleAlert
          aria-hidden="true"
          className="mx-auto size-12 text-danger"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="verify-email-heading"
        >
          Verification is unavailable
        </h1>
        <p className="text-sm leading-6 text-muted-foreground" role="alert">
          We couldn’t verify this email right now. Please try again later.
        </p>
      </>
    );
  } else {
    content = (
      <>
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto size-12 animate-spin text-primary"
          strokeWidth={1.75}
        />
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="verify-email-heading"
        >
          Verifying your email
        </h1>
        <p
          aria-live="polite"
          className="text-sm leading-6 text-muted-foreground"
          role="status"
        >
          Please wait while we verify your email address.
        </p>
      </>
    );
  }

  return (
    <section
      aria-labelledby="verify-email-heading"
      className="mx-auto max-w-xl space-y-5 rounded-lg border border-border bg-surface p-5 text-center shadow-sm sm:p-8"
    >
      <div className="space-y-4">{content}</div>
    </section>
  );
}
