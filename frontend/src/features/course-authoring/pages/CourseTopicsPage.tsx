import type { ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useParams } from "react-router";
import {
  teacherCourseParamsSchema,
  type TeacherCourseResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import TopicList from "../components/TopicList.js";
import CourseDetails from "../components/CourseDetails.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";

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

function errorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

function CourseTopicsError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const status = errorStatus(error);

  if (status === 401) {
    return (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to view this course's topics. <SignInLink />
        </p>
      </Notice>
    );
  }

  if (status === 403) {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>
          Topics are available only to the active Teacher who owns the course.
        </p>
      </Notice>
    );
  }

  if (status === 404) {
    return (
      <Notice title="Course not found" tone="error">
        <p>The course or its topics are not available to your account.</p>
      </Notice>
    );
  }

  return (
    <Notice title="We couldn't load the course topics" tone="error">
      <p>Topic details are hidden. Please try again.</p>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </button>
    </Notice>
  );
}

function CourseError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const status = errorStatus(error);

  if (status === 401) {
    return (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to view this course. <SignInLink />
        </p>
      </Notice>
    );
  }
  if (status === 403) {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>This course is not available to your account.</p>
      </Notice>
    );
  }
  if (status === 404) {
    return (
      <Notice title="Course not found" tone="error">
        <p>
          The course may have been removed or is not available to your account.
        </p>
      </Notice>
    );
  }

  return (
    <Notice title="We couldn't load this course" tone="error">
      <p>Course details and topics are hidden. Please try again.</p>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </button>
    </Notice>
  );
}

function CourseSummary({ course }: { course: TeacherCourseResponse }) {
  return <CourseDetails course={course} />;
}

export default function CourseTopicsPage() {
  const { courseId: routeCourseId } = useParams();
  const queryClient = useQueryClient();
  const parsedParams = teacherCourseParamsSchema.safeParse({
    courseId: routeCourseId,
  });
  const courseQuery = useTeacherCourse(
    parsedParams.success ? parsedParams.data.courseId : null,
  );
  const course = courseQuery.data;
  const topicsQuery = useCourseTopics(
    parsedParams.success ? course?.id : undefined,
  );

  let content: ReactNode;

  if (!parsedParams.success) {
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
      <Notice title="Sign in to view course topics">
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
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            })
          }
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
    content = (
      <CourseError
        error={courseQuery.error}
        onRetry={() => void courseQuery.refetch()}
      />
    );
  } else if (!course) {
    content = (
      <Notice title="Course not found" tone="error">
        <p>The course is not available to your account.</p>
      </Notice>
    );
  } else if (topicsQuery.isPending) {
    content = (
      <>
        <CourseSummary course={course} />
        <Notice title="Loading topics">
          <p className="flex items-center gap-2">
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin text-primary"
            />
            Please wait while this course's topics load.
          </p>
        </Notice>
      </>
    );
  } else if (topicsQuery.isError) {
    content = (
      <>
        <CourseSummary course={course} />
        <CourseTopicsError
          error={topicsQuery.error}
          onRetry={() => void topicsQuery.refetch()}
        />
      </>
    );
  } else {
    content = (
      <>
        <CourseSummary course={course} />
        {course.status !== "draft" && (
          <Notice title="Topics are read-only">
            <p>
              Topic management is available only while a course is a draft. This
              course is currently {course.status.replace("_", " ")}.
            </p>
          </Notice>
        )}
        <TopicList
          canManage={course.status === "draft"}
          courseId={course.id}
          topics={topicsQuery.data?.items ?? []}
        />
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <li>
            <Link
              className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              to="/teacher/courses"
            >
              My Courses
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {parsedParams.success ? (
              <Link
                className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                to={`/teacher/courses/${encodeURIComponent(parsedParams.data.courseId)}`}
              >
                {course?.title ?? "Course"}
              </Link>
            ) : (
              <span>Course</span>
            )}
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-foreground">
            Topics
          </li>
        </ol>
      </nav>
      <nav aria-label="Course navigation">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to={
            parsedParams.success
              ? `/teacher/courses/${encodeURIComponent(parsedParams.data.courseId)}`
              : "/teacher/courses"
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to course
        </Link>
      </nav>
      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">Teacher workspace</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Course topics
        </h1>
      </header>
      {content}
    </main>
  );
}
