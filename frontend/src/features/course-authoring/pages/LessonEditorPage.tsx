import type { ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useBlocker, useLocation, useParams } from "react-router";
import { useEffect, useState } from "react";
import {
  teacherCourseTopicLessonParamsSchema,
  teacherTopicLessonCollectionParamsSchema,
  type TeacherLessonResponse,
  type TeacherTopicResponse,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import CourseDetails from "../components/CourseDetails.js";
import LessonContentRenderer from "../components/LessonContentRenderer.js";
import LessonForm from "../components/LessonForm.js";
import { useLesson } from "../hooks/useLesson.js";
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

function ResourceError({
  title,
  noun,
  error,
  onRetry,
}: {
  title: string;
  noun: string;
  error: unknown;
  onRetry: () => void;
}) {
  const status = error instanceof ApiError ? error.status : null;

  if (status === 401) {
    return (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to view this {noun}. <SignInLink />
        </p>
      </Notice>
    );
  }
  if (status === 403) {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>This course content is not available to your account.</p>
      </Notice>
    );
  }
  if (status === 404) {
    return (
      <Notice title={title} tone="error">
        <p>This {noun} is not available to your account.</p>
      </Notice>
    );
  }

  return (
    <Notice title={title} tone="error">
      <p>The {noun} details are hidden. Please try again.</p>
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

function TopicSummary({ topic }: { topic: TeacherTopicResponse }) {
  return (
    <section
      aria-label="Parent topic"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <p className="text-sm font-semibold text-primary">
        Topic {topic.position}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">
        {topic.title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {topic.description ?? "No topic description provided."}
      </p>
    </section>
  );
}

function LessonInformation({
  lesson,
  showContent = true,
}: {
  lesson: TeacherLessonResponse;
  showContent?: boolean;
}) {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <article
      aria-labelledby="lesson-information-heading"
      className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="space-y-2">
        <h2
          className="text-2xl font-bold text-foreground"
          id="lesson-information-heading"
        >
          Lesson information
        </h2>
      </header>

      {showContent && (
        <section aria-labelledby="lesson-content-heading" className="space-y-2">
          <h3
            className="text-sm font-semibold text-foreground"
            id="lesson-content-heading"
          >
            Lesson content
          </h3>
          <LessonContentRenderer content={lesson.content} />
        </section>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-sm font-semibold text-foreground">Created</dt>
          <dd className="text-sm text-muted-foreground">
            <time dateTime={lesson.createdAt}>
              {dateFormatter.format(new Date(lesson.createdAt))}
            </time>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-semibold text-foreground">
            Last updated
          </dt>
          <dd className="text-sm text-muted-foreground">
            <time dateTime={lesson.updatedAt}>
              {dateFormatter.format(new Date(lesson.updatedAt))}
            </time>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function LessonEditorPage() {
  const {
    courseId: routeCourseId,
    topicId: routeTopicId,
    lessonId: routeLessonId,
  } = useParams();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const blocker = useBlocker(hasUnsavedChanges);
  const isCreating =
    routeLessonId === "new" || pathname.endsWith("/lessons/new");
  const parsedParent = teacherTopicLessonCollectionParamsSchema.safeParse({
    courseId: routeCourseId,
    topicId: routeTopicId,
  });
  const parsedLesson = isCreating
    ? null
    : teacherCourseTopicLessonParamsSchema.safeParse({
        courseId: routeCourseId,
        topicId: routeTopicId,
        lessonId: routeLessonId,
      });
  const courseQuery = useTeacherCourse(
    parsedParent.success ? parsedParent.data.courseId : null,
  );
  const course = courseQuery.data;
  const topicQuery = useTopic(
    course?.id,
    parsedParent.success ? parsedParent.data.topicId : null,
  );
  const topic = topicQuery.data;
  const lessonQuery = useLesson(
    course?.id,
    topic?.id,
    parsedLesson?.success ? parsedLesson.data.lessonId : null,
  );
  const lesson = lessonQuery.data;
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
  const visibleLesson =
    visibleTopic &&
    lessonQuery.authorizationStatus === "authorized" &&
    !lessonQuery.isError
      ? lesson
      : undefined;

  useEffect(() => {
    if (blocker.state !== "blocked") return;

    const shouldLeave = window.confirm(
      "You have unsaved lesson changes. Leave this page and discard them?",
    );

    if (shouldLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  let content: ReactNode;

  if (!parsedParent.success || (!isCreating && !parsedLesson?.success)) {
    content = (
      <Notice title="Invalid lesson link" tone="error">
        <p>The course, topic, or lesson address is invalid.</p>
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
      <Notice title="Sign in to manage lessons">
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
          Your account information is unavailable. Lesson details are hidden.
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
        noun="course"
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
  } else if (topicQuery.authorizationStatus === "unauthenticated") {
    content = (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to manage lessons. <SignInLink />
        </p>
      </Notice>
    );
  } else if (topicQuery.authorizationStatus === "forbidden") {
    content = (
      <Notice title="Teacher access required" tone="error">
        <p>This topic is not available to your account.</p>
      </Notice>
    );
  } else if (topicQuery.authorizationStatus === "error") {
    content = (
      <Notice title="We couldn't check your session" tone="error">
        <p>
          Topic and lesson information are hidden until your session is checked.
        </p>
      </Notice>
    );
  } else if (topicQuery.isPending) {
    content = (
      <>
        <CourseDetails course={course} />
        <LoadingNotice
          title="Loading topic"
          message="Please wait while the parent topic loads."
        />
      </>
    );
  } else if (topicQuery.isError) {
    content = (
      <>
        <CourseDetails course={course} />
        <ResourceError
          error={topicQuery.error}
          noun="topic"
          onRetry={() => void topicQuery.refetch()}
          title="We couldn't load this topic"
        />
      </>
    );
  } else if (!topic) {
    content = (
      <Notice title="Topic not found" tone="error">
        <p>This topic is not available in the selected course.</p>
      </Notice>
    );
  } else if (isCreating && course.status !== "draft") {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <Notice title="Lessons are read-only">
          <p>
            Lessons can be created only while a course is a draft. This course
            is currently {course.status.replace("_", " ")}.
          </p>
        </Notice>
      </>
    );
  } else if (isCreating) {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <section
          aria-labelledby="create-lesson-heading"
          className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
        >
          <div className="space-y-2">
            <h2
              className="text-xl font-semibold text-foreground"
              id="create-lesson-heading"
            >
              Create a lesson
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Lesson position is assigned automatically. You can save an
              incomplete lesson while the course is a draft.
            </p>
          </div>
          <LessonForm
            courseId={course.id}
            onDirtyChange={setHasUnsavedChanges}
            topicId={topic.id}
          />
        </section>
      </>
    );
  } else if (lessonQuery.authorizationStatus === "unauthenticated") {
    content = (
      <Notice title="Your session has expired" tone="error">
        <p>
          Sign in again to view this lesson. <SignInLink />
        </p>
      </Notice>
    );
  } else if (lessonQuery.authorizationStatus === "forbidden") {
    content = (
      <Notice title="Teacher access required" tone="error">
        <p>This lesson is not available to your account.</p>
      </Notice>
    );
  } else if (lessonQuery.authorizationStatus === "error") {
    content = (
      <Notice title="We couldn't check your session" tone="error">
        <p>Lesson information is hidden until your session is checked.</p>
      </Notice>
    );
  } else if (lessonQuery.isPending) {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <LoadingNotice
          title="Loading lesson"
          message="Please wait while the lesson loads."
        />
      </>
    );
  } else if (lessonQuery.isError) {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <ResourceError
          error={lessonQuery.error}
          noun="lesson"
          onRetry={() => void lessonQuery.refetch()}
          title="We couldn't load this lesson"
        />
      </>
    );
  } else if (!lesson) {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <Notice title="Lesson not found" tone="error">
          <p>This lesson is not available in the selected topic.</p>
        </Notice>
      </>
    );
  } else {
    content = (
      <>
        <CourseDetails course={course} />
        <TopicSummary topic={topic} />
        <LessonInformation lesson={lesson} showContent={course.status !== "draft"} />
        {course.status === "draft" ? (
          <section
            aria-labelledby="edit-lesson-heading"
            className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
          >
            <div className="space-y-2">
              <h2
                className="text-xl font-semibold text-foreground"
                id="edit-lesson-heading"
              >
                Edit lesson
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Lesson position and parent relationships are managed by the
                system.
              </p>
            </div>
            <LessonForm
              courseId={course.id}
              initialLesson={lesson}
              onDirtyChange={setHasUnsavedChanges}
              onUpdated={() => void lessonQuery.refetch()}
              topicId={topic.id}
            />
          </section>
        ) : (
          <Notice title="This lesson is read-only">
            <p>
              Lessons can be edited only while a course is a draft. This course
              is currently {course.status.replace("_", " ")}.
            </p>
          </Notice>
        )}
      </>
    );
  }

  const backToCourseContent = parsedParent.success
    ? `/teacher/courses/${encodeURIComponent(parsedParent.data.courseId)}?tab=content&expandedTopicId=${encodeURIComponent(parsedParent.data.topicId)}`
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
            {parsedParent.success ? (
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
            {parsedParent.success ? (
              <Link
                className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                to={`/teacher/courses/${encodeURIComponent(parsedParent.data.courseId)}/topics`}
              >
                Topics
              </Link>
            ) : (
              <span>Topics</span>
            )}
          </li>
          <li aria-hidden="true">/</li>
          <li>
            {parsedParent.success ? (
              <Link
                className="rounded-sm underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                to={`/teacher/courses/${encodeURIComponent(parsedParent.data.courseId)}/topics/${encodeURIComponent(parsedParent.data.topicId)}`}
              >
                {visibleTopic?.title ?? "Topic"}
              </Link>
            ) : (
              <span>Topic</span>
            )}
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-foreground">
            {visibleLesson?.title ?? (isCreating ? "New lesson" : "Lesson")}
          </li>
        </ol>
      </nav>
      <nav aria-label="Lesson navigation">
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
          {isCreating ? "Create lesson" : visibleLesson?.title ?? "Lesson editor"}
        </h1>
        {!isCreating && visibleLesson && (
          <p className="text-sm text-muted-foreground">
            Lesson {visibleLesson.position}
          </p>
        )}
      </header>
      {content}
    </main>
  );
}
