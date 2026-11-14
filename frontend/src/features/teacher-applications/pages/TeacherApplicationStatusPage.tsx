import type { ReactNode } from "react";

import { AlertCircle, ArrowRight, BadgeCheck, Clock3 } from "lucide-react";
import { Link } from "react-router";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { useMyTeacherApplication } from "../hooks/useMyTeacherApplication.js";

function StatusMessage({
  title,
  children,
  tone = "info",
  icon,
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "success" | "error";
  icon: ReactNode;
}) {
  const toneClasses = {
    info: "border-border",
    success: "border-success",
    error: "border-danger",
  }[tone];

  return (
    <section
      aria-labelledby="teacher-application-status-heading"
      className={"space-y-3 rounded-lg border bg-surface p-5 " + toneClasses}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2
          className="text-lg font-semibold text-foreground"
          id="teacher-application-status-heading"
        >
          {title}
        </h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TeacherApplicationStatusPage() {
  const currentUser = useCurrentUser();
  const applicationQuery = useMyTeacherApplication();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-primary">
          Teacher applications
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Application status
        </h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          An administrator reviews each application before Teacher access is
          granted.
        </p>
      </header>

      {currentUser.status === "loading" && (
        <StatusMessage
          icon={<Clock3 aria-hidden="true" className="size-5" />}
          title="Checking your session"
        >
          <p>Please wait while we check your sign-in status.</p>
        </StatusMessage>
      )}

      {currentUser.status === "error" && (
        <StatusMessage
          icon={<AlertCircle aria-hidden="true" className="size-5" />}
          title="We couldn't check your session"
          tone="error"
        >
          <p>Please refresh the page or sign in again.</p>
        </StatusMessage>
      )}

      {currentUser.status === "unauthenticated" && (
        <StatusMessage
          icon={<AlertCircle aria-hidden="true" className="size-5" />}
          title="Sign in to view your application"
        >
          <Link
            className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to="/login"
          >
            Sign in <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Link>
        </StatusMessage>
      )}

      {currentUser.status === "authenticated" &&
        currentUser.user.roles.includes("teacher") && (
          <StatusMessage
            icon={<BadgeCheck aria-hidden="true" className="size-5" />}
            title="You already have Teacher access"
            tone="success"
          >
            <p>Your account has the Teacher role.</p>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isPending && (
          <StatusMessage
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            title="Loading your application"
          >
            <p>Please wait while we load your latest application.</p>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isError && (
          <StatusMessage
            icon={<AlertCircle aria-hidden="true" className="size-5" />}
            title="We couldn't load your application"
            tone="error"
          >
            <p>Please try again. Your application details are not shown.</p>
            <button
              className="min-h-10 rounded-md border border-border px-4 py-2 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={() => void applicationQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isSuccess &&
        applicationQuery.data.application === null && (
          <StatusMessage
            icon={<AlertCircle aria-hidden="true" className="size-5" />}
            title="No application found"
          >
            <p>You have not submitted a teacher application yet.</p>
            <Link
              className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              to="/teacher/apply"
            >
              Start an application{" "}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Link>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isSuccess &&
        applicationQuery.data.application?.status === "pending" && (
          <StatusMessage
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            title="Your application is pending review"
          >
            <p>
              An administrator will review your application. You can return here
              to check for an update.
            </p>
            <time dateTime={applicationQuery.data.application.submittedAt}>
              Submitted {applicationQuery.data.application.submittedAt}
            </time>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isSuccess &&
        applicationQuery.data.application?.status === "approved" && (
          <StatusMessage
            icon={<BadgeCheck aria-hidden="true" className="size-5" />}
            title="Your application was approved"
            tone="success"
          >
            <p>
              Your application was approved. If Teacher access is not yet
              visible, refresh your session or sign in again.
            </p>
          </StatusMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isSuccess &&
        applicationQuery.data.application?.status === "rejected" && (
          <StatusMessage
            icon={<AlertCircle aria-hidden="true" className="size-5" />}
            title="Your application was not approved"
            tone="error"
          >
            {applicationQuery.data.application.rejectionReason && (
              <p>
                <span className="font-semibold text-foreground">
                  Administrator feedback:
                </span>{" "}
                {applicationQuery.data.application.rejectionReason}
              </p>
            )}
            <p>You may submit a new application with updated information.</p>
            <Link
              className="inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              to="/teacher/apply"
            >
              Apply again{" "}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Link>
          </StatusMessage>
        )}
    </main>
  );
}
