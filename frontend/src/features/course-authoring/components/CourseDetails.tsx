import type { ReactNode } from "react";

import type { TeacherCourseResponse } from "@edutrack/contracts";
import { BadgeCheck, BookOpen, CircleX, Clock3, FileText } from "lucide-react";

const statusDetails: Record<
  TeacherCourseResponse["status"],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  draft: {
    label: "Draft",
    className: "bg-info-surface text-info",
    icon: Clock3,
  },
  pending_review: {
    label: "Pending review",
    className: "bg-warning-surface text-warning",
    icon: Clock3,
  },
  published: {
    label: "Published",
    className: "bg-success-surface text-success",
    icon: BadgeCheck,
  },
  rejected: {
    label: "Rejected",
    className: "bg-danger-surface text-danger",
    icon: CircleX,
  },
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm font-semibold text-foreground">{label}</dt>
      <dd className="break-words text-sm leading-6 text-muted-foreground">
        {children}
      </dd>
    </div>
  );
}

export interface CourseDetailsProps {
  course: TeacherCourseResponse;
}

export default function CourseDetails({ course }: CourseDetailsProps) {
  const status = statusDetails[course.status];
  const StatusIcon = status.icon;

  return (
    <article
      aria-labelledby="course-details-heading"
      className="space-y-6 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpen aria-hidden="true" className="size-5" />
            {course.academicLevel.name} · {course.subject.name}
          </p>
          <h2
            className="text-2xl font-bold text-foreground"
            id="course-details-heading"
          >
            {course.title}
          </h2>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${status.className}`}
          role="status"
        >
          <StatusIcon aria-hidden="true" className="size-4" />
          {status.label}
        </span>
      </header>

      <dl className="grid gap-5 sm:grid-cols-2">
        <Detail label="Description">
          {course.description ? (
            <span className="whitespace-pre-wrap">{course.description}</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <FileText aria-hidden="true" className="size-4" />
              No description provided.
            </span>
          )}
        </Detail>
        <Detail label="Academic level">{course.academicLevel.name}</Detail>
        <Detail label="Subject">{course.subject.name}</Detail>
        <Detail label="Status">{status.label}</Detail>
        <Detail label="Created">
          <time dateTime={course.createdAt}>
            {formatDate(course.createdAt)}
          </time>
        </Detail>
        <Detail label="Last updated">
          <time dateTime={course.updatedAt}>
            {formatDate(course.updatedAt)}
          </time>
        </Detail>
      </dl>
    </article>
  );
}
