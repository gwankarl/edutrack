import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Link } from "react-router";
import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

const statusLabels: Record<TeacherCourseResponse["status"], string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
};

const statusClasses: Record<TeacherCourseResponse["status"], string> = {
  draft: "bg-info-surface text-info",
  pending_review: "bg-warning-surface text-warning",
  published: "bg-success-surface text-success",
  rejected: "bg-danger-surface text-danger",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export interface TeacherCourseListProps {
  courses: readonly TeacherCourseResponse[];
  pagination: TeacherCourseListResponse["pagination"];
  isFetching: boolean;
  onPageChange: (page: number) => void;
}

export default function TeacherCourseList({
  courses,
  pagination,
  isFetching,
  onPageChange,
}: TeacherCourseListProps) {
  return (
    <section aria-label="Your courses" className="space-y-4">
      <div
        aria-label="Courses table"
        className="overflow-x-auto rounded-lg border border-border bg-surface"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <caption className="sr-only">Your courses</caption>
          <thead className="bg-surface-muted text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold" scope="col">
                Course
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Academic level
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Subject
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Status
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Created
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                Last updated
              </th>
              <th className="px-4 py-3 font-semibold" scope="col">
                <span className="sr-only">Course actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {courses.map((course) => (
              <tr key={course.id}>
                <th
                  className="max-w-64 px-4 py-4 text-left font-semibold text-foreground"
                  scope="row"
                >
                  <span className="block truncate">{course.title}</span>
                </th>
                <td className="px-4 py-4 text-muted-foreground">
                  {course.academicLevel.name}
                </td>
                <td className="px-4 py-4 text-muted-foreground">
                  {course.subject.name}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[course.status]}`}
                  >
                    {statusLabels[course.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                  <time dateTime={course.createdAt}>
                    {formatDate(course.createdAt)}
                  </time>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                  <time dateTime={course.updatedAt}>
                    {formatDate(course.updatedAt)}
                  </time>
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <Link
                    aria-label={`View details for ${course.title}`}
                    className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    to={`/teacher/courses/${encodeURIComponent(course.id)}`}
                  >
                    <Eye aria-hidden="true" className="size-4" />
                    View details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Course pages"
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Page {pagination.page} of {pagination.totalPages} ·{" "}
          {pagination.totalItems} courses
        </p>
        <div className="flex gap-2">
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pagination.page <= 1 || isFetching}
            onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Previous
          </button>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pagination.page >= pagination.totalPages || isFetching}
            onClick={() => onPageChange(pagination.page + 1)}
            type="button"
          >
            Next
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </nav>
    </section>
  );
}
