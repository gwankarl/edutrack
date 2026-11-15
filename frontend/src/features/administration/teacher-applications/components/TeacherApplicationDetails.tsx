import { BadgeCheck, CircleX, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import type { AdminTeacherApplicationResponse } from "@edutrack/contracts";

const statusDetails: Record<
  AdminTeacherApplicationResponse["status"],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  pending: {
    label: "Pending",
    className: "bg-warning-surface text-warning",
    icon: Clock3,
  },
  approved: {
    label: "Approved",
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
    <div className="space-y-1">
      <dt className="text-sm font-semibold text-foreground">{label}</dt>
      <dd className="wrap-break-word text-sm leading-6 text-muted-foreground">
        {children}
      </dd>
    </div>
  );
}

export interface TeacherApplicationDetailsProps {
  application: AdminTeacherApplicationResponse;
}

export default function TeacherApplicationDetails({
  application,
}: TeacherApplicationDetailsProps) {
  const status = statusDetails[application.status];
  const StatusIcon = status.icon;

  return (
    <article
      aria-labelledby="teacher-application-details-heading"
      className="space-y-6 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            className="text-xl font-semibold text-foreground"
            id="teacher-application-details-heading"
          >
            Application details
          </h2>
          <p className="text-sm text-muted-foreground">
            Submitted{" "}
            <time dateTime={application.submittedAt}>
              {formatDate(application.submittedAt)}
            </time>
          </p>
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
        <Detail label="Applicant name">
          {application.applicant.displayName}
        </Detail>
        <Detail label="Applicant email">
          <a
            className="break-all text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={`mailto:${application.applicant.email}`}
          >
            {application.applicant.email}
          </a>
        </Detail>
        <Detail label="Qualifications and background">
          <span className="whitespace-pre-wrap">
            {application.qualifications}
          </span>
        </Detail>
        <Detail label="Motivation">
          <span className="whitespace-pre-wrap">{application.motivation}</span>
        </Detail>

        {application.reviewedAt && (
          <Detail label="Reviewed">
            <time dateTime={application.reviewedAt}>
              {formatDate(application.reviewedAt)}
            </time>
          </Detail>
        )}

        {application.reviewer && (
          <Detail label="Reviewed by">
            <span className="block">{application.reviewer.displayName}</span>
            <span className="block break-all">
              {application.reviewer.email}
            </span>
          </Detail>
        )}

        {application.rejectionReason && (
          <Detail label="Rejection reason">
            <span className="whitespace-pre-wrap">
              {application.rejectionReason}
            </span>
          </Detail>
        )}
      </dl>

      {application.reviewNotes && (
        <section
          aria-labelledby="teacher-application-review-notes-heading"
          className="space-y-2 border-t border-border pt-5"
        >
          <h3
            className="font-semibold text-foreground"
            id="teacher-application-review-notes-heading"
          >
            Internal review notes
          </h3>
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-muted-foreground">
            {application.reviewNotes}
          </p>
        </section>
      )}
    </article>
  );
}
