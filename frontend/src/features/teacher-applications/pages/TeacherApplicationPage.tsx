import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Clock3,
  FileText,
} from "lucide-react";
import { Link } from "react-router";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import TeacherApplicationForm from "../components/TeacherApplicationForm.js";
import { useMyTeacherApplication } from "../hooks/useMyTeacherApplication.js";

function PageMessage({
  icon,
  title,
  children,
  tone = "info",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tone?: "info" | "success" | "error";
}) {
  const toneClassName = {
    info: "border-border bg-surface text-foreground",
    success: "border-success bg-surface text-foreground",
    error: "border-danger bg-surface text-foreground",
  }[tone];

  return (
    <section
      aria-labelledby="teacher-application-message-heading"
      className={`space-y-3 rounded-lg border p-5 ${toneClassName}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2
          className="text-lg font-semibold text-foreground"
          id="teacher-application-message-heading"
        >
          {title}
        </h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TeacherApplicationPage() {
  const currentUser = useCurrentUser();
  const applicationQuery = useMyTeacherApplication();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-semibold text-primary">For educators</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Apply to become an EduTrack teacher
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          Tell us about your motivation and relevant background. An
          administrator reviews every application before a Teacher role is
          granted.
        </p>
      </header>

      <section
        aria-labelledby="teacher-application-process-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2
          className="mb-3 text-lg font-semibold text-foreground"
          id="teacher-application-process-heading"
        >
          How the process works
        </h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>Submit your motivation and qualifications or background.</li>
          <li>An administrator reviews your application.</li>
          <li>
            If approved, your teacher profile and Teacher access are created.
          </li>
        </ol>
      </section>

      {currentUser.status === "loading" && (
        <PageMessage
          icon={<Clock3 aria-hidden="true" className="size-5" />}
          title="Checking your session"
        >
          <p>Please wait while we check your sign-in status.</p>
        </PageMessage>
      )}

      {currentUser.status === "error" && (
        <PageMessage
          icon={<AlertCircle aria-hidden="true" className="size-5" />}
          title="We couldn't check your session"
          tone="error"
        >
          <p>Please refresh the page or sign in again.</p>
          <Link
            className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to="/login"
          >
            Go to login <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </PageMessage>
      )}

      {currentUser.status === "unauthenticated" && (
        <PageMessage
          icon={<AlertCircle aria-hidden="true" className="size-5" />}
          title="Sign in to apply"
        >
          <p>You need an active account to submit a teacher application.</p>
          <Link
            className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to="/login"
          >
            Sign in <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </PageMessage>
      )}

      {currentUser.status === "authenticated" &&
        currentUser.user.roles.includes("teacher") && (
          <PageMessage
            icon={<BadgeCheck aria-hidden="true" className="size-5" />}
            title="You already have Teacher access"
            tone="success"
          >
            <p>Your account already has the Teacher role.</p>
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isPending && (
          <PageMessage
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            title="Checking your application"
          >
            <p>Please wait while we load your application status.</p>
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        applicationQuery.isError && (
          <PageMessage
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
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        !applicationQuery.isPending &&
        !applicationQuery.isError &&
        applicationQuery.data?.application?.status === "pending" && (
          <PageMessage
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            title="Your application is pending"
          >
            <p>
              An administrator must review your application before a decision.
            </p>
            <Link
              className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              to="/teacher/application-status"
            >
              View application status{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        !applicationQuery.isPending &&
        !applicationQuery.isError &&
        applicationQuery.data?.application?.status === "approved" && (
          <PageMessage
            icon={<BadgeCheck aria-hidden="true" className="size-5" />}
            title="Your application was approved"
            tone="success"
          >
            <p>
              Your application is approved. If Teacher access is not yet
              visible, refresh your session or sign in again.
            </p>
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        !applicationQuery.isPending &&
        !applicationQuery.isError &&
        applicationQuery.data?.application?.status === "rejected" && (
          <PageMessage
            icon={<FileText aria-hidden="true" className="size-5" />}
            title="Your previous application was not approved"
          >
            <p>
              <span className="font-semibold text-foreground">
                Administrator feedback:
              </span>{" "}
              {applicationQuery.data.application.rejectionReason}
            </p>
            <p>You may submit a new application with updated information.</p>
          </PageMessage>
        )}

      {currentUser.status === "authenticated" &&
        !currentUser.user.roles.includes("teacher") &&
        !applicationQuery.isPending &&
        !applicationQuery.isError &&
        (applicationQuery.data?.application === null ||
          applicationQuery.data?.application?.status === "rejected") && (
          <TeacherApplicationForm />
        )}
    </main>
  );
}
