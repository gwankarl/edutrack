import { useState } from "react";
import type { ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import {
  teacherCourseParamsSchema,
  teacherCourseTopicParamsSchema,
  type TeacherTopicResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CourseDetails from "../components/CourseDetails.js";
import LessonList from "../components/LessonList.js";
import TopicForm from "../components/TopicForm.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import { useTopic } from "../hooks/useTopic.js";
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

function ResourceError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const status = error instanceof ApiError ? error.status : null;

  if (status === 401) {
    return (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to manage this topic. <SignInLink />
        </p>
      </Notice>
    );
  }
  if (status === 403) {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>This course or topic is not available to your account.</p>
      </Notice>
    );
  }
  if (status === 404) {
    return (
      <Notice title={title} tone="error">
        <p>The course or topic is not available to your account.</p>
      </Notice>
    );
  }

  return (
    <Notice title={title} tone="error">
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

function TopicInformation({ topic }: { topic: TeacherTopicResponse }) {
  return (
    <article
      aria-labelledby="topic-information-heading"
      className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">
          Topic {topic.position}
        </p>
        <h2
          className="text-2xl font-bold text-foreground"
          id="topic-information-heading"
        >
          {topic.title}
        </h2>
      </header>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <dt className="text-sm font-semibold text-foreground">Description</dt>
          <dd className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {topic.description ?? "No description provided."}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-semibold text-foreground">Created</dt>
          <dd className="text-sm text-muted-foreground">
            <time dateTime={topic.createdAt}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(topic.createdAt))}
            </time>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-semibold text-foreground">
            Last updated
          </dt>
          <dd className="text-sm text-muted-foreground">
            <time dateTime={topic.updatedAt}>
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(topic.updatedAt))}
            </time>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function LoadingNotice({ title, message }: { title: string; message: string }) {
  return (
    <Notice title={title}>
      <p className="flex items-center gap-2">
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin text-primary"
        />
        {message}
      </p>
    </Notice>
  );
}

function LessonsError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const status = error instanceof ApiError ? error.status : null;

  if (status === 401) {
    return (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to view this topic's lessons. <SignInLink />
        </p>
      </Notice>
    );
  }
  if (status === 403) {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>Lessons are not available to your account.</p>
      </Notice>
    );
  }
  if (status === 404) {
    return (
      <Notice title="Lessons not found" tone="error">
        <p>Lessons for this topic are not available to your account.</p>
      </Notice>
    );
  }

  return (
    <Notice title="We couldn't load the lessons" tone="error">
      <p>Lesson information is hidden. Please try again.</p>
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

export default function TopicDetailsPage() {
  const { courseId: routeCourseId, topicId: routeTopicId } = useParams();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const isCreating = routeTopicId === "new" || pathname.endsWith("/topics/new");
  const parsedCourse = teacherCourseParamsSchema.safeParse({
    courseId: routeCourseId,
  });
  const parsedTopic = isCreating
    ? null
    : teacherCourseTopicParamsSchema.safeParse({
        courseId: routeCourseId,
        topicId: routeTopicId,
      });
  const courseQuery = useTeacherCourse(
    parsedCourse.success ? parsedCourse.data.courseId : null,
  );
  const course = courseQuery.data;
  const topicQuery = useTopic(
    course?.id,
    parsedTopic?.success ? parsedTopic.data.topicId : null,
  );
  const topic = topicQuery.data;
  const lessonsQuery = useTopicLessons(course?.id, topic?.id);
  const [createdTopicId, setCreatedTopicId] = useState<string | null>(null);
  const visibleCourse =
    courseQuery.authorizationStatus === "authorized" && !courseQuery.isError
      ? course
      : undefined;
  const visibleTopic =
    visibleCourse &&
    topicQuery.authorizationStatus === "authorized" &&
    !topicQuery.isError
      ? topic
      : undefined;

  let content: ReactNode;

  if (!parsedCourse.success || (!isCreating && !parsedTopic?.success)) {
    content = (
      <Notice title="Invalid topic link" tone="error">
        <p>The course or topic address is invalid.</p>
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
      <Notice title="Sign in to manage course topics">
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
          Your account information is unavailable. Topic details are hidden.
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
      <LoadingNotice
        title="Loading course"
        message="Please wait while the course loads."
      />
    );
  } else if (courseQuery.isError) {
    content = (
      <ResourceError
        error={courseQuery.error}
        onRetry={() => void courseQuery.refetch()}
        title="We couldn't load this course"
      />
    );
  } else if (!course) {
    content = (
      <Notice title="Course not found" tone="error">
        <p>The course is not available to your account.</p>
      </Notice>
    );
  } else if (isCreating && course.status !== "draft") {
    content = (
      <>
        <CourseDetails course={course} />
        <Notice title="Topics are read-only">
          <p>
            Topics can be created only while a course is a draft. This course is
            currently {course.status.replace("_", " ")}.
          </p>
        </Notice>
      </>
    );
  } else if (isCreating) {
    content = (
      <>
        <CourseDetails course={course} />
        <section
          aria-labelledby="create-topic-heading"
          className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
        >
          <div className="space-y-2">
            <h2
              className="text-xl font-semibold text-foreground"
              id="create-topic-heading"
            >
              Create a topic
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Topic position is assigned automatically when it is saved.
            </p>
          </div>
          <TopicForm
            courseId={course.id}
            onCreated={(createdTopic) => setCreatedTopicId(createdTopic.id)}
          />
        </section>
      </>
    );
  } else if (topicQuery.isPending) {
    content = (
      <>
        <CourseDetails course={course} />
        <LoadingNotice
          title="Loading topic"
          message="Please wait while the topic loads."
        />
      </>
    );
  } else if (topicQuery.isError) {
    content = (
      <>
        <CourseDetails course={course} />
        <ResourceError
          error={topicQuery.error}
          onRetry={() => void topicQuery.refetch()}
          title="We couldn't load this topic"
        />
      </>
    );
  } else if (!topic) {
    content = (
      <>
        <CourseDetails course={course} />
        <Notice title="Topic not found" tone="error">
          <p>This topic is not available in the selected course.</p>
        </Notice>
      </>
    );
  } else {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicInformation topic={topic} />
        {lessonsQuery.isPending ? (
          <LoadingNotice
            title="Loading lessons"
            message="Please wait while this topic's lessons load."
          />
        ) : lessonsQuery.isError ? (
          <LessonsError
            error={lessonsQuery.error}
            onRetry={() => void lessonsQuery.refetch()}
          />
        ) : (
          <LessonList
            canManage={course.status === "draft"}
            courseId={course.id}
            lessons={lessonsQuery.data?.items ?? []}
            topicId={topic.id}
          />
        )}
        {course.status === "draft" ? (
          <section
            aria-labelledby="edit-topic-heading"
            className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
          >
            <div className="space-y-2">
              <h2
                className="text-xl font-semibold text-foreground"
                id="edit-topic-heading"
              >
                Edit topic
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                The topic's position and course relationship are managed by the
                system.
              </p>
            </div>
            <TopicForm
              courseId={course.id}
              initialTopic={topic}
              onUpdated={() => void topicQuery.refetch()}
            />
          </section>
        ) : (
          <Notice title="This topic is read-only">
            <p>
              Topics can be edited only while a course is a draft. This course
              is currently {course.status.replace("_", " ")}.
            </p>
          </Notice>
        )}
      </>
    );
  }

  const returnTopicId = isCreating ? createdTopicId : topic?.id;
  const backToCourseContent = parsedCourse.success
    ? `/teacher/courses/${encodeURIComponent(parsedCourse.data.courseId)}?tab=content${
        returnTopicId
          ? `&expandedTopicId=${encodeURIComponent(returnTopicId)}`
          : ""
      }`
    : "/teacher/courses";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
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
            {parsedCourse.success ? (
              <Link
                className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                to={backToCourseContent}
              >
                {visibleCourse?.title ?? "Course"}
              </Link>
            ) : (
              <span>Course</span>
            )}
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {parsedCourse.success ? (
              <Link
                className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                to={`/teacher/courses/${encodeURIComponent(parsedCourse.data.courseId)}/topics`}
              >
                Topics
              </Link>
            ) : (
              <span>Topics</span>
            )}
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-foreground">
            {visibleTopic?.title ?? (isCreating ? "New topic" : "Topic")}
          </li>
        </ol>
      </nav>
      <nav aria-label="Topic navigation">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to={backToCourseContent}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Course Content
        </Link>
      </nav>
      <header className="space-y-2">
        <p className="text-sm font-semibold text-primary">Teacher workspace</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {isCreating ? "Create topic" : "Topic details"}
        </h1>
      </header>
      {content}
    </main>
  );
}
