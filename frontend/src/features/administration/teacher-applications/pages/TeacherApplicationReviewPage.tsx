import type { ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";

import { ApiError } from "../../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../../auth/hooks/auth-query-keys.js";
import TeacherApplicationDetails from "../components/TeacherApplicationDetails.js";
import TeacherApplicationDecisionForm from "../components/TeacherApplicationDecisionForm.js";
import { useTeacherApplicationDetail } from "../hooks/useTeacherApplicationDetail.js";

function Notice({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <section
      aria-live="polite"
      className={`space-y-2 rounded-lg border bg-surface p-5 ${
        tone === "error" ? "border-danger" : "border-border"
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function isSafeReturnPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export default function TeacherApplicationReviewPage() {
  const { applicationId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const applicationQuery = useTeacherApplicationDetail(applicationId);

  const routeState = location.state as { from?: unknown } | null;
  const backTo = isSafeReturnPath(routeState?.from)
    ? routeState.from
    : "/admin/teacher-applications";

  function backLink() {
    return (
      <Link
        className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        to={backTo}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Applications
      </Link>
    );
  }

  function retrySession() {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }

  let content: ReactNode;

  if (applicationQuery.authorizationStatus === "loading") {
    content = (
      <Notice title="Checking administrator access">
        <p>Please wait while we check your session.</p>
      </Notice>
    );
  } else if (applicationQuery.authorizationStatus === "unauthenticated") {
    content = (
      <Notice title="Sign in to review this application">
        <Link
          className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in
        </Link>
      </Notice>
    );
  } else if (applicationQuery.authorizationStatus === "forbidden") {
    content = (
      <Notice title="Administrator access required" tone="error">
        <p>This application is available to Administrator accounts.</p>
      </Notice>
    );
  } else if (applicationQuery.authorizationStatus === "error") {
    content = (
      <Notice title="We couldn't check your session" tone="error">
        <p>Your account details are not shown. Please try again.</p>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={retrySession}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Try again
        </button>
      </Notice>
    );
  } else if (applicationQuery.validationError) {
    content = (
      <Notice title="Invalid application link" tone="error">
        <p>The application ID in this link is invalid.</p>
        {backLink()}
      </Notice>
    );
  } else if (applicationQuery.isPending) {
    content = (
      <Notice title="Loading application">
        <p className="flex items-center gap-2">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          Please wait while the application loads.
        </p>
      </Notice>
    );
  } else if (applicationQuery.isError) {
    const status =
      applicationQuery.error instanceof ApiError
        ? applicationQuery.error.status
        : null;

    if (status === 404) {
      content = (
        <Notice title="Application not found" tone="error">
          <p>
            This application may have been removed or the link may be outdated.
          </p>
          {backLink()}
        </Notice>
      );
    } else if (status === 401) {
      content = (
        <Notice title="Your session may have expired" tone="error">
          <p>Sign in again with an Administrator account to continue.</p>
          <Link
            className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
            to="/login"
          >
            Sign in
          </Link>
        </Notice>
      );
    } else if (status === 403) {
      content = (
        <Notice title="Administrator access required" tone="error">
          <p>You do not have permission to view this application.</p>
        </Notice>
      );
    } else if (status === 400) {
      content = (
        <Notice title="Invalid application link" tone="error">
          <p>The application link could not be processed.</p>
          {backLink()}
        </Notice>
      );
    } else {
      content = (
        <Notice title="We couldn't load this application" tone="error">
          <p>Please try again. Application details are not shown.</p>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            disabled={applicationQuery.isFetching}
            onClick={() => void applicationQuery.refetch()}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${applicationQuery.isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </Notice>
      );
    }
  } else if (applicationQuery.data) {
    content = (
      <div className="space-y-6">
        <TeacherApplicationDetails application={applicationQuery.data} />
        <TeacherApplicationDecisionForm
          applicationId={applicationQuery.data.id}
          applicationStatus={applicationQuery.data.status}
          onConflict={() => {
            void applicationQuery.refetch();
          }}
        />
      </div>
    );
  } else {
    content = (
      <Notice title="Application unavailable" tone="error">
        <p>Application details are not available.</p>
        {backLink()}
      </Notice>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-4">
        {backLink()}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">
            Administrator review
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Teacher application
          </h1>
        </div>
      </header>

      {content}
    </main>
  );
}
