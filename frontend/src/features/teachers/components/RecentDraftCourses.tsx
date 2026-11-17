import { CircleAlert, FileText, RefreshCw } from "lucide-react";
import type { TeacherDashboardSummaryResponse } from "@edutrack/contracts";
import { Link } from "react-router";

export interface RecentDraftCoursesProps {
  courses?: TeacherDashboardSummaryResponse["recentDraftCourses"];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RecentDraftSkeletons() {
  return (
    <section aria-labelledby="recent-drafts-heading" className="space-y-4">
      <h2
        className="text-xl font-semibold text-foreground"
        id="recent-drafts-heading"
      >
        Recent Draft Courses
      </h2>
      <p aria-live="polite" className="sr-only" role="status">
        Loading recent Draft courses.
      </p>
      <div aria-hidden="true" className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            className="h-20 animate-pulse rounded-lg border border-border bg-surface p-5"
            key={index}
          >
            <div className="h-4 w-48 rounded bg-surface-muted" />
            <div className="mt-3 h-3 w-32 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RecentDraftCourses({
  courses,
  isLoading,
  isError,
  isFetching,
  onRetry,
}: RecentDraftCoursesProps) {
  if (isLoading) {
    return <RecentDraftSkeletons />;
  }

  if (isError || !courses) {
    return (
      <section aria-labelledby="recent-drafts-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold text-foreground"
          id="recent-drafts-heading"
        >
          Recent Draft Courses
        </h2>
        <div
          aria-live="polite"
          className="space-y-3 rounded-lg border border-danger bg-danger-surface p-5"
          role="alert"
        >
          <p className="font-semibold text-danger">
            We couldn&apos;t load your Draft courses.
          </p>
          <p className="text-sm leading-6 text-danger">
            Your recent Draft courses are not shown. Please try again.
          </p>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-danger px-4 font-semibold text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isFetching}
            onClick={onRetry}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="recent-drafts-heading" className="space-y-4">
      <h2
        className="text-xl font-semibold text-foreground"
        id="recent-drafts-heading"
      >
        Recent Draft Courses
      </h2>

      {courses.length === 0 ? (
        <p
          className="rounded-lg border border-border bg-surface p-5 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          You do not have any Draft courses yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                aria-label={`Open course: ${course.title}`}
                className="flex min-h-20 flex-col gap-2 rounded-md p-5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:flex-row sm:items-center sm:justify-between"
                to={`/teacher/courses/${encodeURIComponent(course.id)}`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <FileText
                    aria-hidden="true"
                    className="size-5 shrink-0 text-primary"
                  />
                  <span className="truncate font-semibold text-foreground">
                    {course.title}
                  </span>
                </span>
                <span className="flex items-center gap-2 pl-8 text-sm text-muted-foreground sm:pl-0">
                  <CircleAlert
                    aria-hidden="true"
                    className="size-4 text-info"
                  />
                  <time dateTime={course.updatedAt}>
                    Draft · Updated {formatDate(course.updatedAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
