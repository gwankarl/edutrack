import { Link, useLocation } from "react-router";
import type { AdminTeacherApplicationResponse } from "@edutrack/contracts";

const statusLabel: Record<AdminTeacherApplicationResponse["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const statusClasses: Record<AdminTeacherApplicationResponse["status"], string> =
  {
    pending: "bg-warning-surface text-warning",
    approved: "bg-success-surface text-success",
    rejected: "bg-danger-surface text-danger",
  };

function formatSubmittedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface TeacherApplicationsTableProps {
  applications: readonly AdminTeacherApplicationResponse[];
}

export default function TeacherApplicationsTable({
  applications,
}: TeacherApplicationsTableProps) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <div
      aria-label="Teacher applications table"
      className="overflow-x-auto rounded-lg border border-border bg-surface"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-3xl border-collapse text-left">
        <caption className="sr-only">Teacher applications</caption>
        <thead className="bg-surface-muted text-sm text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold" scope="col">
              Applicant
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Email
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Status
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              Submitted
            </th>
            <th className="px-4 py-3 font-semibold" scope="col">
              <span className="sr-only">Application actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((application) => (
            <tr key={application.id}>
              <td className="px-4 py-4 font-medium text-foreground">
                {application.applicant.displayName}
              </td>
              <td className="break-all px-4 py-4 text-muted-foreground">
                {application.applicant.email}
              </td>
              <td className="px-4 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[application.status]}`}
                >
                  {statusLabel[application.status]}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                <time dateTime={application.submittedAt}>
                  {formatSubmittedAt(application.submittedAt)}
                </time>
              </td>
              <td className="whitespace-nowrap px-4 py-4">
                <Link
                  state={{ from: returnTo }}
                  aria-label={`View details for ${application.applicant.displayName}`}
                  className="min-h-10 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  to={`/admin/teacher-applications/${encodeURIComponent(application.id)}`}
                >
                  View Details
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
