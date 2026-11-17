import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CircleAlert,
  Clock3,
  FileText,
  PencilLine,
} from "lucide-react";
import { Link } from "react-router";
import type { TeacherCourseResponse } from "@edutrack/contracts";

type CourseView = "grid" | "list";

interface CourseCardProps {
  course: TeacherCourseResponse;
  view?: CourseView;
}

const statusDetails: Record<
  TeacherCourseResponse["status"],
  { label: string; className: string; Icon: typeof FileText }
> = {
  draft: {
    label: "Draft",
    className: "bg-info-surface text-info",
    Icon: FileText,
  },
  pending_review: {
    label: "Pending review",
    className: "bg-warning-surface text-warning",
    Icon: Clock3,
  },
  published: {
    label: "Published",
    className: "bg-success-surface text-success",
    Icon: BadgeCheck,
  },
  rejected: {
    label: "Rejected",
    className: "bg-danger-surface text-danger",
    Icon: CircleAlert,
  },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CourseCard({ course, view = "grid" }: CourseCardProps) {
  const status = statusDetails[course.status];
  const StatusIcon = status.Icon;
  const isDraft = course.status === "draft";
  const actionLabel = isDraft ? "Continue editing" : "View course";
  const ActionIcon = isDraft ? PencilLine : ArrowRight;

  return (
    <article
      className={`overflow-hidden rounded-lg border border-border bg-surface shadow-sm ${
        view === "list" ? "sm:flex" : ""
      }`}
    >
      <div
        className={`relative aspect-video overflow-hidden bg-surface-muted text-primary ${
          view === "list" ? "sm:w-48 sm:shrink-0" : "w-full"
        }`}
      >
        {course.thumbnail?.url ? (
          <img
            alt={`${course.title} course cover`}
            className="size-full object-cover"
            decoding="async"
            loading="lazy"
            src={course.thumbnail.url}
          />
        ) : (
          <div
            aria-label="Course thumbnail placeholder"
            className="flex size-full items-center justify-center"
            role="img"
          >
            <div
              aria-hidden="true"
              className="flex size-14 items-center justify-center rounded-full bg-info-surface"
            >
              <BookOpen className="size-7" />
            </div>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 wrap-break-word text-lg font-semibold text-foreground">
            {course.title}
          </h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
          >
            <StatusIcon aria-hidden="true" className="size-4" />
            {status.label}
          </span>
        </div>

        <p className="line-clamp-3 break-words text-sm leading-6 text-muted-foreground">
          {course.description?.trim() || "No description provided."}
        </p>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted-foreground">
              Academic level
            </dt>
            <dd className="mt-1 text-foreground">
              {course.academicLevel.name}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">Subject</dt>
            <dd className="mt-1 text-foreground">{course.subject.name}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-muted-foreground">Last updated</dt>
            <dd className="mt-1 text-foreground">
              <time dateTime={course.updatedAt}>
                {formatDate(course.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>

        <div className="mt-auto border-t border-border pt-4">
          <Link
            aria-label={`${actionLabel}: ${course.title}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            to={`/teacher/courses/${encodeURIComponent(course.id)}`}
          >
            {actionLabel}
            <ActionIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
