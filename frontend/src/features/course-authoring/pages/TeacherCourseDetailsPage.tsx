import type { ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router";
import { teacherCourseParamsSchema } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CourseOverview from "../components/CourseOverview.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import CourseWorkspaceTabs from "../components/CourseWorkspaceTabs.js";
import CoursePublicationTab from "../components/CoursePublicationTab.js";
import CourseContentTree from "../components/CourseContentTree.js";

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
      className={`space-y-3 rounded-lg border bg-surface p-5 ${
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

function SignInLink() {
  return (
    <Link
      className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
      to="/login"
    >
      Sign in
    </Link>
  );
}

export default function TeacherCourseDetailsPage() {
  const { courseId } = useParams();
  const queryClient = useQueryClient();
  const params = teacherCourseParamsSchema.safeParse({ courseId });
  const courseQuery = useTeacherCourse(courseId);

  function retrySession() {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  }

  const visibleCourse =
    params.success &&
    courseQuery.authorizationStatus === "authorized" &&
    !courseQuery.isError
      ? courseQuery.data
      : undefined;

  let content: ReactNode;

  if (!params.success) {
    content = (
      <Notice title="Invalid course link" tone="error">
        <p>The course address is invalid.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "loading") {
    content = (
      <Notice title="Checking Teacher access">
        <p>Please wait while we check your session.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "unauthenticated") {
    content = (
      <Notice title="Sign in to view this course">
        <SignInLink />
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "forbidden") {
    content = (
      <Notice title="Teacher access required" tone="error">
        <p>This course is available to its active Teacher owner.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "error") {
    content = (
      <Notice title="We couldn't check your session" tone="error">
        <p>
          Your account information is unavailable. Course details are hidden.
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={retrySession}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Try again
        </button>
      </Notice>
    );
  } else if (courseQuery.isPending) {
    content = (
      <Notice title="Loading course">
        <p className="flex items-center gap-2">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          Please wait while the course loads.
        </p>
      </Notice>
    );
  } else if (courseQuery.isError) {
    const status =
      courseQuery.error instanceof ApiError ? courseQuery.error.status : null;

    if (status === 401) {
      content = (
        <Notice title="Your session has expired" tone="error">
          <p>
            Sign in again to view this course. <SignInLink />
          </p>
        </Notice>
      );
    } else if (status === 403) {
      content = (
        <Notice title="Teacher access required" tone="error">
          <p>This course is not available to your account.</p>
        </Notice>
      );
    } else if (status === 404) {
      content = (
        <Notice title="Course not found" tone="error">
          <p>
            The course may have been removed or is not available to your
            account.
          </p>
        </Notice>
      );
    } else {
      content = (
        <Notice title="We couldn't load this course" tone="error">
          <p>Course details are hidden. Please try again.</p>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={courseQuery.isFetching}
            onClick={() => void courseQuery.refetch()}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${courseQuery.isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </Notice>
      );
    }
  } else if (!courseQuery.data) {
    content = (
      <Notice title="Course not found" tone="error">
        <p>The course is not available to your account.</p>
      </Notice>
    );
  } else {
    const course = courseQuery.data;

    content = (
      <CourseWorkspaceTabs
        courseContent={
          <CourseContentTree
            canManage={course.status === "draft"}
            courseId={course.id}
          />
        }
        overview={
          <CourseOverview
            course={course}
            onUpdated={() => void courseQuery.refetch()}
          />
        }
        publication={<CoursePublicationTab course={course} />}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          <li>
            <Link
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              to="/teacher/courses"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to My Courses
            </Link>
          </li>
          {visibleCourse && (
            <>
              <li aria-hidden="true" className="text-muted-foreground">
                /
              </li>
              <li
                aria-current="page"
                className="max-w-full truncate text-muted-foreground"
              >
                {visibleCourse.title}
              </li>
            </>
          )}
        </ol>
      </nav>

      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">Teacher workspace</p>
        <h1 className="wrap-break-word text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {visibleCourse?.title ?? "Course details"}
        </h1>
        {visibleCourse && (
          <p
            aria-label={`Course status: ${visibleCourse.status.replace("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())}`}
            className="inline-flex rounded-full bg-info-surface px-3 py-1 text-sm font-semibold text-info"
          >
            {visibleCourse.status
              .replace("_", " ")
              .replace(/\b\w/g, (character) => character.toUpperCase())}
          </p>
        )}
      </header>

      {content}
    </main>
  );
}
