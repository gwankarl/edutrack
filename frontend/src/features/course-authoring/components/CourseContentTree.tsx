import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { TeacherTopicResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import {
  useReorderCourseTopics,
  useReorderTopicLessons,
} from "../hooks/useContentReordering.js";
import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import {
  useTeacherQuizzes,
  useReorderTeacherQuizzes,
} from "../hooks/useQuizAuthoring.js";

type AuthorizationStatus = ReturnType<
  typeof useCourseTopics
>["authorizationStatus"];

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
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function RetryButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <RefreshCw
        aria-hidden="true"
        className={`size-4 ${disabled ? "animate-spin" : ""}`}
      />
      Try again
    </button>
  );
}

function AuthorizationNotice({
  status,
  retrySession,
}: {
  status: AuthorizationStatus;
  retrySession: () => void;
}): ReactNode | null {
  if (status === "authorized") return null;

  if (status === "loading") {
    return (
      <Notice title="Checking Teacher access">
        <p>Please wait while we check your session.</p>
      </Notice>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Notice title="Sign in to view course content">
        <Link
          className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in
        </Link>
      </Notice>
    );
  }

  if (status === "forbidden") {
    return (
      <Notice title="Teacher access required" tone="error">
        <p>This course content is available to its active Teacher owner.</p>
      </Notice>
    );
  }

  return (
    <Notice title="We couldn't check your session" tone="error">
      <p>Your account information is unavailable. Course content is hidden.</p>
      <RetryButton onClick={retrySession} />
    </Notice>
  );
}

function QueryError({
  error,
  resource,
  onRetry,
  isFetching,
}: {
  error: unknown;
  resource: string;
  onRetry: () => void;
  isFetching: boolean;
}) {
  const status = error instanceof ApiError ? error.status : null;
  let message = `We couldn't load ${resource}. Please try again.`;

  if (status === 401) {
    message = `Your session expired while loading ${resource}. Sign in again, then retry.`;
  } else if (status === 403) {
    message = `You no longer have permission to view ${resource}.`;
  } else if (status === 404) {
    message = `${resource} are no longer available for this course.`;
  }

  return (
    <Notice title={`We couldn't load ${resource}`} tone="error">
      <p>{message}</p>
      <RetryButton disabled={isFetching} onClick={onRetry} />
    </Notice>
  );
}

function reorderErrorMessage(
  error: unknown,
  resource: "topics" | "lessons",
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return `Your session expired. Sign in again to reorder ${resource}.`;
    }
    if (error.status === 403) {
      return `You are no longer authorized to reorder these ${resource}.`;
    }
    if (error.status === 404) {
      return `The course or ${resource} could not be found. The list has been refreshed.`;
    }
    if (error.status === 409) {
      return `The course is no longer a draft or the ${resource} order changed. The list has been refreshed.`;
    }
  }

  return `We couldn't reorder the ${resource}. The list has been refreshed; try again.`;
}

function LessonSection({
  courseId,
  topic,
  canManage,
}: {
  courseId: string;
  topic: TeacherTopicResponse;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const lessonsQuery = useTopicLessons(courseId, topic.id);
  const reorder = useReorderTopicLessons(courseId, topic.id);
  const authorized = lessonsQuery.authorizationStatus === "authorized";
  const lessons = lessonsQuery.data?.items ?? [];
  const encodedCourseId = encodeURIComponent(courseId);
  const encodedTopicId = encodeURIComponent(topic.id);
  const lessonsPath = `/teacher/courses/${encodedCourseId}/topics/${encodedTopicId}/lessons`;
  const retrySession = () => {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  };

  const authorizationNotice = AuthorizationNotice({
    retrySession,
    status: lessonsQuery.authorizationStatus,
  });

  function moveLesson(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (
      !canManage ||
      !authorized ||
      reorder.isPending ||
      targetIndex < 0 ||
      targetIndex >= lessons.length
    ) {
      return;
    }

    const lessonIds = lessons.map((lesson) => lesson.id);
    [lessonIds[index], lessonIds[targetIndex]] = [
      lessonIds[targetIndex],
      lessonIds[index],
    ];

    reorder.reset();
    reorder.mutate({ lessonIds });
  }

  return (
    <section
      aria-labelledby={`lessons-heading-${topic.id}`}
      className="space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h4
          className="font-semibold text-foreground"
          id={`lessons-heading-${topic.id}`}
        >
          Lessons
          {lessonsQuery.isSuccess && ` (${lessons.length})`}
        </h4>
        {canManage && authorized && (
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 font-semibold text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to={`${lessonsPath}/new`}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add Lesson
          </Link>
        )}
      </header>

      {authorizationNotice ??
        (lessonsQuery.isPending ? (
          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            Loading lessons for {topic.title}…
          </p>
        ) : lessonsQuery.isError ? (
          <QueryError
            error={lessonsQuery.error}
            isFetching={lessonsQuery.isFetching}
            onRetry={() => void lessonsQuery.refetch()}
            resource={`lessons for ${topic.title}`}
          />
        ) : lessons.length === 0 ? (
          <p
            className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground"
            role="status"
          >
            {canManage && authorized
              ? "This topic has no lessons yet. Add a lesson to start preparing its content."
              : "This topic does not have any lessons."}
          </p>
        ) : (
          <ol className="divide-y divide-border rounded-md border border-border">
            {lessons.map((lesson, index) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                key={lesson.id}
              >
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Lesson {lesson.position}
                  </p>
                  <p className="wrap-break-word font-medium text-foreground">
                    {lesson.title}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {canManage && authorized && (
                    <>
                      <button
                        aria-label={`Move lesson ${lesson.title} up`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => moveLesson(index, -1)}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        aria-label={`Move lesson ${lesson.title} down`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          index === lessons.length - 1 || reorder.isPending
                        }
                        onClick={() => moveLesson(index, 1)}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </button>
                    </>
                  )}
                  <Link
                    className="inline-flex min-h-10 items-center rounded-md px-3 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    to={`${lessonsPath}/${encodeURIComponent(lesson.id)}`}
                  >
                    {canManage && authorized ? "Edit lesson" : "View lesson"}
                    <span className="sr-only">: {lesson.title}</span>
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        ))}

      {canManage && reorder.isPending && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Saving lesson order…
        </p>
      )}
      {canManage && reorder.isSuccess && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          Lesson order updated.
        </p>
      )}
      {canManage && reorder.isError && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-danger"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {reorderErrorMessage(reorder.error, "lessons")}
        </p>
      )}
    </section>
  );
}

export interface CourseContentTreeProps {
  courseId: string;
  canManage: boolean;
}

function TopicQuizSection({
  courseId,
  topic,
  canManage,
}: {
  courseId: string;
  topic: TeacherTopicResponse;
  canManage: boolean;
}) {
  const query = useTeacherQuizzes(courseId, topic.id);
  const reorder = useReorderTeacherQuizzes(courseId, topic.id);
  const authorized = query.authorizationStatus === "authorized";
  const quizzes = query.data?.items ?? [];
  const basePath = `/teacher/courses/${encodeURIComponent(courseId)}/topics/${encodeURIComponent(topic.id)}/quizzes`;
  const returnQuery = `?tab=content&expandedTopicId=${encodeURIComponent(topic.id)}`;

  function moveQuiz(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (
      !canManage ||
      !authorized ||
      reorder.isPending ||
      target < 0 ||
      target >= quizzes.length
    ) {
      return;
    }

    const quizIds = quizzes.map((quiz) => quiz.id);
    [quizIds[index], quizIds[target]] = [quizIds[target], quizIds[index]];
    reorder.reset();
    reorder.mutate({ quizIds });
  }

  return (
    <section
      aria-labelledby={`quiz-list-heading-${topic.id}`}
      className="space-y-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h4
          className="font-semibold text-foreground"
          id={`quiz-list-heading-${topic.id}`}
        >
          Quizzes{query.isSuccess ? ` (${quizzes.length})` : ""}
        </h4>
        {canManage && authorized && (
          <Link
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to={`${basePath}/new${returnQuery}`}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add Quiz
          </Link>
        )}
      </header>

      {query.authorizationStatus === "loading" ? (
        <p role="status">Checking Teacher access…</p>
      ) : query.authorizationStatus === "unauthenticated" ? (
        <p role="alert">Sign in to view this topic’s quizzes.</p>
      ) : query.authorizationStatus === "forbidden" ? (
        <p role="alert">
          Teacher access is required to view this quiz content.
        </p>
      ) : query.authorizationStatus === "error" ? (
        <p role="alert">
          We couldn’t verify your session. Retry after checking your connection.
        </p>
      ) : query.isPending ? (
        <p role="status">Loading quizzes…</p>
      ) : query.isError ? (
        <div className="space-y-2" role="alert">
          <p>We couldn’t load quizzes for {topic.title}.</p>
          <button
            className="min-h-10 rounded-md border border-border px-3"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : quizzes.length === 0 ? (
        <p
          className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground"
          role="status"
        >
          {canManage && authorized
            ? "This topic has no quizzes yet. Add a quiz to begin."
            : "This topic does not have any quizzes."}
        </p>
      ) : (
        <ol
          aria-label={`Quizzes for ${topic.title}`}
          className="divide-y divide-border rounded-md border border-border"
        >
          {quizzes.map((quiz, index) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 p-3"
              key={quiz.id}
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Quiz {quiz.position}
                </p>
                <p className="wrap-break-word font-medium text-foreground">
                  {quiz.title}
                </p>
                {quiz.description && (
                  <p className="text-sm text-muted-foreground">
                    {quiz.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {canManage && authorized && (
                  <>
                    <button
                      aria-label={`Move quiz ${quiz.title} up`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => moveQuiz(index, -1)}
                      type="button"
                    >
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label={`Move quiz ${quiz.title} down`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
                      disabled={
                        index === quizzes.length - 1 || reorder.isPending
                      }
                      onClick={() => moveQuiz(index, 1)}
                      type="button"
                    >
                      <ArrowDown aria-hidden="true" className="size-4" />
                    </button>
                  </>
                )}
                <Link
                  className="inline-flex min-h-10 items-center rounded-md px-3 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  to={`${basePath}/${encodeURIComponent(quiz.id)}${returnQuery}`}
                >
                  {canManage && authorized ? "Open quiz" : "View quiz"}
                  <span className="sr-only">: {quiz.title}</span>
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      {reorder.isPending && <p role="status">Saving quiz order…</p>}
      {reorder.isSuccess && <p role="status">Quiz order updated.</p>}
      {reorder.isError && (
        <p role="alert" className="text-sm text-danger">
          The quiz order could not be saved. The server order has been
          refreshed; try again.
        </p>
      )}
    </section>
  );
}

export default function CourseContentTree({
  courseId,
  canManage,
}: CourseContentTreeProps) {
  const queryClient = useQueryClient();
  const treeId = useId().replace(/:/g, "");
  const [searchParams] = useSearchParams();
  const expandedTopicId = searchParams.get("expandedTopicId");
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(
    () => new Set(),
  );
  const topicsQuery = useCourseTopics(courseId);
  const reorder = useReorderCourseTopics(courseId);
  const authorized = topicsQuery.authorizationStatus === "authorized";
  const topics = topicsQuery.data?.items ?? [];
  const encodedCourseId = encodeURIComponent(courseId);
  const retrySession = () => {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  };

  const authorizationNotice = AuthorizationNotice({
    retrySession,
    status: topicsQuery.authorizationStatus,
  });

  useEffect(() => {
    if (
      !expandedTopicId ||
      !topics.some((topic) => topic.id === expandedTopicId)
    ) {
      return;
    }

    setExpandedTopicIds((current) => {
      if (current.has(expandedTopicId)) return current;
      return new Set(current).add(expandedTopicId);
    });
  }, [expandedTopicId, topics]);

  function toggleTopic(topicId: string) {
    setExpandedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function moveTopic(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (
      !canManage ||
      !authorized ||
      reorder.isPending ||
      targetIndex < 0 ||
      targetIndex >= topics.length
    ) {
      return;
    }

    const topicIds = topics.map((topic) => topic.id);
    [topicIds[index], topicIds[targetIndex]] = [
      topicIds[targetIndex],
      topicIds[index],
    ];

    reorder.reset();
    reorder.mutate({ topicIds });
  }

  return (
    <section
      aria-labelledby={`${treeId}-heading`}
      className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">Course content</p>
          <h2
            className="text-xl font-semibold text-foreground"
            id={`${treeId}-heading`}
          >
            Topics
          </h2>
        </div>
        {canManage && authorized && (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:self-auto"
            to={`/teacher/courses/${encodedCourseId}/topics/new`}
          >
            <Plus aria-hidden="true" className="size-5" />
            Add Topic
          </Link>
        )}
      </header>

      {authorizationNotice ??
        (topicsQuery.isPending ? (
          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            Loading topics…
          </p>
        ) : topicsQuery.isError ? (
          <QueryError
            error={topicsQuery.error}
            isFetching={topicsQuery.isFetching}
            onRetry={() => void topicsQuery.refetch()}
            resource="topics"
          />
        ) : topics.length === 0 ? (
          <p
            className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground"
            role="status"
          >
            {canManage && authorized
              ? "This course has no topics yet. Add a topic to begin organizing its content."
              : "This course does not have any topics."}
          </p>
        ) : (
          <ol aria-label="Course topics" className="space-y-3">
            {topics.map((topic, index) => {
              const expanded = expandedTopicIds.has(topic.id);
              const panelId = `${treeId}-topic-${topic.id}-content`;
              const topicPath = `/teacher/courses/${encodedCourseId}/topics/${encodeURIComponent(topic.id)}`;

              return (
                <li className="rounded-md border border-border" key={topic.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <button
                      aria-controls={panelId}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} topic ${topic.title}`}
                      className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md text-left font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      onClick={() => toggleTopic(topic.id)}
                      type="button"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                      <span className="min-w-0 wrap-break-word">
                        {topic.title}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        Topic {topic.position}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      {canManage && authorized && (
                        <>
                          <button
                            aria-label={`Move topic ${topic.title} up`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={index === 0 || reorder.isPending}
                            onClick={() => moveTopic(index, -1)}
                            type="button"
                          >
                            <ArrowUp aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            aria-label={`Move topic ${topic.title} down`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={
                              index === topics.length - 1 || reorder.isPending
                            }
                            onClick={() => moveTopic(index, 1)}
                            type="button"
                          >
                            <ArrowDown aria-hidden="true" className="size-4" />
                          </button>
                        </>
                      )}
                      <Link
                        className="inline-flex min-h-10 items-center rounded-md px-3 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        to={topicPath}
                      >
                        {canManage && authorized ? "Edit topic" : "View topic"}
                        <span className="sr-only">: {topic.title}</span>
                      </Link>
                    </div>
                  </div>

                  <div
                    aria-label={`Expanded content for ${topic.title}`}
                    className="space-y-5 border-t border-border p-4 sm:p-5"
                    hidden={!expanded}
                    id={panelId}
                    role="region"
                  >
                    {expanded && (
                      <>
                        <LessonSection
                          canManage={canManage}
                          courseId={courseId}
                          topic={topic}
                        />
                        <TopicQuizSection
                          canManage={canManage}
                          courseId={courseId}
                          topic={topic}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ))}

      {canManage && reorder.isPending && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Saving topic order…
        </p>
      )}
      {canManage && reorder.isSuccess && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          Topic order updated.
        </p>
      )}
      {canManage && reorder.isError && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-danger"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {reorderErrorMessage(reorder.error, "topics")}
        </p>
      )}
    </section>
  );
}
