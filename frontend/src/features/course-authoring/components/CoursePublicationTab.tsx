import { useId, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type {
  CourseStatus,
  TeacherCourseResponse,
  TeacherTopicResponse,
} from "@edutrack/contracts";

import { useCourseTopics } from "../hooks/useCourseTopics.js";
import { useTopicLessons } from "../hooks/useTopicLessons.js";
import { useTeacherQuizzes } from "../hooks/useQuizAuthoring.js";

const statusDetails: Record<
  CourseStatus,
  { label: string; explanation: string }
> = {
  draft: {
    label: "Draft",
    explanation:
      "This course is a work in progress. Draft courses can be edited in the authoring workspace.",
  },
  pending_review: {
    label: "Pending review",
    explanation:
      "The current course status is Pending review. Submission and review details are not available in this workspace yet.",
  },
  published: {
    label: "Published",
    explanation:
      "The current course status is Published. This course is read-only in this authoring workspace.",
  },
  rejected: {
    label: "Rejected",
    explanation:
      "The current course status is Rejected. Resubmission controls are not available in this workspace yet.",
  },
};

type ContentQueryResult = {
  authorizationStatus:
    "loading" | "unauthenticated" | "forbidden" | "error" | "authorized";
  data?: { items: readonly unknown[] };
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

function RetryButton({
  label,
  disabled,
  onRetry,
}: {
  label: string;
  disabled: boolean;
  onRetry: () => void;
}) {
  return (
    <button
      aria-label={`Try checking ${label} again`}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onRetry}
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

function ContentCount({
  label,
  query,
}: {
  label: string;
  query: ContentQueryResult;
}) {
  let message: string;

  if (query.authorizationStatus === "loading") {
    message = "Checking Teacher access.";
  } else if (query.authorizationStatus !== "authorized") {
    message = "Information unavailable; Teacher access could not be confirmed.";
  } else if (query.isPending) {
    message = `Checking ${label.toLowerCase()}.`;
  } else if (query.isError) {
    message = `${label} information could not be checked.`;
  } else if (query.isSuccess && query.data) {
    const count = query.data.items.length;
    const singularLabel = label === "Lessons" ? "lesson" : "quiz";
    const itemLabel = count === 1 ? singularLabel : `${singularLabel}s`;
    message = `${count} ${itemLabel} recorded.`;
  } else {
    message = `${label} information has not been checked.`;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3">
      <p aria-live="polite" className="text-sm text-foreground">
        {message}
      </p>
      {query.isError && query.authorizationStatus === "authorized" && (
        <RetryButton
          disabled={query.isFetching}
          label={label.toLowerCase()}
          onRetry={() => void query.refetch()}
        />
      )}
    </div>
  );
}

function TopicInventory({
  courseId,
  topic,
}: {
  courseId: string;
  topic: TeacherTopicResponse;
}) {
  const lessons = useTopicLessons(courseId, topic.id);
  const quizzes = useTeacherQuizzes(courseId, topic.id);

  return (
    <div className="space-y-2 border-t border-border p-3">
      <ContentCount label="Lessons" query={lessons} />
      <ContentCount label="Quizzes" query={quizzes} />
    </div>
  );
}

function TopicInventoryDisclosure({
  courseId,
  topic,
}: {
  courseId: string;
  topic: TeacherTopicResponse;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        aria-controls={expanded ? panelId : undefined}
        aria-expanded={expanded}
        aria-label={`Topic ${topic.position}: ${topic.title}. ${expanded ? "Hide content check" : "Content unchecked"}`}
        className="flex min-h-12 w-full items-center justify-between gap-3 p-3 text-left font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span>
          Topic {topic.position}: {topic.title}
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {expanded ? "Hide content check" : "Content unchecked"}
          {expanded ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
        </span>
      </button>
      {expanded && (
        <div id={panelId}>
          <TopicInventory courseId={courseId} topic={topic} />
        </div>
      )}
    </li>
  );
}

export default function CoursePublicationTab({
  course,
}: {
  course: TeacherCourseResponse;
}) {
  const topicsQuery = useCourseTopics(course.id);
  const status = statusDetails[course.status];

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="publication-status-heading"
        className="space-y-3 rounded-lg border border-border bg-surface p-5"
      >
        <h2
          className="text-xl font-semibold text-foreground"
          id="publication-status-heading"
        >
          Publication status
        </h2>
        <p
          aria-label={`Current course status: ${status.label}`}
          className="inline-flex rounded-full bg-info-surface px-3 py-1 text-sm font-semibold text-info"
        >
          {status.label}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {status.explanation}
        </p>
      </section>

      <section
        aria-labelledby="publication-checklist-heading"
        className="space-y-4 rounded-lg border border-border bg-surface p-5"
      >
        <header className="space-y-2">
          <h2
            className="text-xl font-semibold text-foreground"
            id="publication-checklist-heading"
          >
            Course content inventory
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            This is an informational inventory of saved course data. It does not
            determine publication readiness.
          </p>
        </header>

        <ul aria-label="Course content checklist" className="space-y-3">
          <li className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
            <Check
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-success"
            />
            <div>
              <p className="font-medium text-foreground">
                Course information confirmed
              </p>
              <p className="text-sm text-muted-foreground">
                {course.title} · {course.academicLevel.name} ·{" "}
                {course.subject.name}
              </p>
            </div>
          </li>

          <li className="space-y-3 rounded-lg border border-border bg-background p-3">
            <div className="flex items-start gap-3">
              {topicsQuery.isSuccess && topicsQuery.data?.items ? (
                <Check
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">Topics</p>

                {topicsQuery.authorizationStatus === "loading" ? (
                  <p
                    aria-live="polite"
                    className="text-sm text-muted-foreground"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-1 inline size-4 animate-spin"
                    />
                    Checking topics.
                  </p>
                ) : topicsQuery.authorizationStatus !== "authorized" ? (
                  <p className="text-sm text-muted-foreground">
                    Topic information is unavailable because Teacher access
                    could not be confirmed.
                  </p>
                ) : topicsQuery.isPending ? (
                  <p
                    aria-live="polite"
                    className="text-sm text-muted-foreground"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-1 inline size-4 animate-spin"
                    />
                    Checking topics.
                  </p>
                ) : topicsQuery.isError ? (
                  <div className="space-y-2">
                    <p className="text-sm text-danger">
                      Topic information could not be checked.
                    </p>
                    <RetryButton
                      disabled={topicsQuery.isFetching}
                      label="topics"
                      onRetry={() => void topicsQuery.refetch()}
                    />
                  </div>
                ) : topicsQuery.data ? (
                  <p className="text-sm text-muted-foreground">
                    {topicsQuery.data.items.length === 0
                      ? "No topics are currently recorded."
                      : `${topicsQuery.data.items.length} topics recorded. Expand a topic to check its lessons and quizzes.`}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Topic information has not been checked.
                  </p>
                )}
              </div>
            </div>

            {topicsQuery.authorizationStatus === "authorized" &&
              topicsQuery.isSuccess &&
              topicsQuery.data?.items &&
              topicsQuery.data.items.length > 0 && (
                <ol aria-label="Topic content checks" className="space-y-2">
                  {topicsQuery.data.items.map((topic) => (
                    <TopicInventoryDisclosure
                      courseId={course.id}
                      key={topic.id}
                      topic={topic}
                    />
                  ))}
                </ol>
              )}
          </li>
        </ul>

        <p className="rounded-md border border-info-border bg-info-surface p-3 text-sm leading-6 text-info">
          Final submission eligibility will be determined by the backend
          publication workflow in M4.
        </p>
      </section>

      {course.status === "draft" && (
        <section
          aria-label="Submission action"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <div>
            <h2 className="font-semibold text-foreground">
              Ready for administrator review?
            </h2>
            <p className="text-sm text-muted-foreground">
              Submission will be available when the publication workflow is
              implemented.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 font-semibold text-inverse opacity-60"
            disabled
            type="button"
          >
            Submit for Review
            <span className="rounded bg-background/20 px-2 py-0.5 text-xs">
              Coming Soon
            </span>
          </button>
        </section>
      )}
    </div>
  );
}
