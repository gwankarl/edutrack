import { useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2, List } from "lucide-react";
import type {
  TeacherCourseListResponse,
  TeacherCourseResponse,
} from "@edutrack/contracts";

import CourseCard from "./CourseCard.js";

type CourseView = "grid" | "list";

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
  const [view, setView] = useState<CourseView>("grid");

  return (
    <section aria-label="Your courses" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination.totalItems}{" "}
          {pagination.totalItems === 1 ? "course" : "courses"}
        </p>

        <div
          aria-label="Course presentation"
          className="inline-flex self-start rounded-md border border-border bg-surface p-1"
          role="group"
        >
          <button
            aria-pressed={view === "grid"}
            className="inline-flex min-h-10 items-center gap-2 rounded px-3 font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:bg-primary aria-pressed:text-inverse"
            onClick={() => setView("grid")}
            type="button"
          >
            <Grid2X2 aria-hidden="true" className="size-4" />
            Grid
          </button>
          <button
            aria-pressed={view === "list"}
            className="inline-flex min-h-10 items-center gap-2 rounded px-3 font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:bg-primary aria-pressed:text-inverse"
            onClick={() => setView("list")}
            type="button"
          >
            <List aria-hidden="true" className="size-4" />
            List
          </button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only" role="status">
        {view === "grid" ? "Grid view selected." : "List view selected."}
      </p>

      {view === "grid" ? (
        <ul
          aria-label="Courses in grid view"
          className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {courses.map((course) => (
            <li className="min-w-0" key={course.id}>
              <CourseCard course={course} view="grid" />
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label="Courses in list view" className="min-w-0 space-y-4">
          {courses.map((course) => (
            <li className="min-w-0" key={course.id}>
              <CourseCard course={course} view="list" />
            </li>
          ))}
        </ul>
      )}

      <nav
        aria-label="Course pages"
        className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Page {pagination.page} of {pagination.totalPages} —{" "}
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
