import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CircleAlert,
  GraduationCap,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router";

import CourseSummaryCards from "../components/CourseSummaryCards.js";
import RecentDraftCourses from "../components/RecentDraftCourses.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import { useTeacherDashboardSummary } from "../hooks/useTeacherDashboardSummary.js";

export default function TeacherWorkspacePage() {
  const currentUser = useCurrentUser();
  const dashboard = useTeacherDashboardSummary();
  const queryClient = useQueryClient();

  if (currentUser.status === "loading") {
    return (
      <section
        aria-label="Teacher dashboard loading"
        className="rounded-lg border border-border bg-surface p-5 sm:p-6"
      >
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-muted-foreground"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          Loading your Teacher workspace...
        </p>
      </section>
    );
  }

  if (currentUser.status === "unauthenticated") {
    return (
      <section
        aria-labelledby="teacher-workspace-sign-in-heading"
        className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-6"
        role="status"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id="teacher-workspace-sign-in-heading"
        >
          Sign in to view this workspace
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Your Teacher workspace is available after you sign in.
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (
    currentUser.status === "error" ||
    dashboard.authorizationStatus === "error"
  ) {
    return (
      <section
        aria-labelledby="teacher-workspace-error-heading"
        className="space-y-3 rounded-lg border border-danger bg-danger-surface p-5 sm:p-6"
        role="alert"
      >
        <h2
          className="flex items-center gap-2 text-lg font-semibold text-danger"
          id="teacher-workspace-error-heading"
        >
          <CircleAlert aria-hidden="true" className="size-5" />
          We couldn&apos;t load your workspace
        </h2>
        <p className="text-sm leading-6 text-danger">
          Your account information is temporarily unavailable. Please try again.
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-danger px-4 font-medium text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            })
          }
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  if (dashboard.authorizationStatus === "forbidden") {
    return (
      <section
        aria-labelledby="teacher-workspace-forbidden-heading"
        className="space-y-3 rounded-lg border border-danger bg-danger-surface p-5 sm:p-6"
        role="alert"
      >
        <h2
          className="text-lg font-semibold text-danger"
          id="teacher-workspace-forbidden-heading"
        >
          Teacher access required
        </h2>
        <p className="text-sm leading-6 text-danger">
          This workspace is available to active Teacher accounts.
        </p>
      </section>
    );
  }

  const displayName = currentUser.user.displayName.trim() || "Teacher";
  const summary = dashboard.data;
  const hasNoCourses =
    !dashboard.isPending &&
    !dashboard.isError &&
    summary?.statusCounts.total === 0;

  return (
    <div className="min-w-0 space-y-6">
      <section
        aria-labelledby="teacher-dashboard-heading"
        className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-7"
      >
        <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-5" />
          Overview
        </p>
        <h2
          className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          id="teacher-dashboard-heading"
        >
          Welcome, {displayName}!
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Create and organize teacher-curated courses, then prepare learning
          materials your students can follow at their own pace.
        </p>
      </section>

      <nav
        aria-label="Teacher dashboard actions"
        className="flex flex-col gap-3 sm:flex-row"
      >
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/teacher/courses/new"
        >
          <Plus aria-hidden="true" className="size-5" />
          Create Course
        </Link>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/teacher/courses"
        >
          <BookOpen aria-hidden="true" className="size-5" />
          My Courses
        </Link>
      </nav>

      <CourseSummaryCards
        isError={dashboard.isError}
        isFetching={dashboard.isFetching}
        isLoading={dashboard.isPending}
        onRetry={() => {
          void dashboard.refetch();
        }}
        summary={summary}
      />

      {hasNoCourses ? (
        <section
          aria-labelledby="first-course-heading"
          className="space-y-3 rounded-lg border border-info bg-info-surface p-5 sm:p-6"
        >
          <h2
            className="text-lg font-semibold text-foreground"
            id="first-course-heading"
          >
            Start your first course
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            You do not have any courses yet. Create a course to start preparing
            learning materials for your students.
          </p>
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to="/teacher/courses/new"
          >
            <Plus aria-hidden="true" className="size-5" />
            Create your first course
          </Link>
        </section>
      ) : (
        <RecentDraftCourses
          courses={summary?.recentDraftCourses}
          isError={dashboard.isError}
          isFetching={dashboard.isFetching}
          isLoading={dashboard.isPending}
          onRetry={() => {
            void dashboard.refetch();
          }}
        />
      )}
    </div>
  );
}
