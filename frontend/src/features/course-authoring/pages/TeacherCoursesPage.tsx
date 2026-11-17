import { useEffect, useState, type ReactNode } from "react";

import {
  TEACHER_COURSE_DEFAULT_PAGE,
  TEACHER_COURSE_DEFAULT_PAGE_SIZE,
  COURSE_SEARCH_MAX_LENGTH,
  courseStatusSchema,
  teacherCourseSortSchema,
  type CourseStatus,
} from "@edutrack/contracts";
import {
  BookOpen,
  ListFilter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import type { TeacherCourseListFilters } from "../api/courses.api.js";
import { useTeacherCourses } from "../hooks/useTeacherCourses.js";
import TeacherCourseList from "../components/TeacherCourseList.js";

type CourseStatusFilter = CourseStatus | "all";
type CourseSort = (typeof teacherCourseSortSchema.options)[number];

const statusLabels: Record<CourseStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
};

const sortLabels: Record<CourseSort, string> = {
  updated_desc: "Recently updated",
  created_desc: "Recently created",
  title_asc: "Title: A to Z",
  title_desc: "Title: Z to A",
};

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
      className={`space-y-2 rounded-lg border bg-surface p-5 ${tone === "error" ? "border-danger" : "border-border"}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TeacherCoursesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(searchFromUrl);

  const parsedStatus = courseStatusSchema.safeParse(searchParams.get("status"));
  const status: CourseStatusFilter = parsedStatus.success
    ? parsedStatus.data
    : "all";
  const requestedPage = Number(searchParams.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1
      ? requestedPage
      : TEACHER_COURSE_DEFAULT_PAGE;
  const parsedSort = teacherCourseSortSchema.safeParse(searchParams.get("sort"));
  const sort: CourseSort = parsedSort.success
    ? parsedSort.data
    : "updated_desc";

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  useEffect(() => {
    const normalizedSearch = searchInput.trim();

    if (normalizedSearch === searchFromUrl) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);

      if (normalizedSearch) {
        nextParams.set("search", normalizedSearch);
      } else {
        nextParams.delete("search");
      }

      nextParams.delete("page");
      setSearchParams(nextParams, { replace: true });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchFromUrl, searchInput, searchParams, setSearchParams]);

  const filters: TeacherCourseListFilters = {
    page,
    pageSize: TEACHER_COURSE_DEFAULT_PAGE_SIZE,
    ...(status === "all" ? {} : { status }),
    ...(searchFromUrl ? { search: searchFromUrl } : {}),
    sort,
  };
  const hasActiveFilters =
    status !== "all" || Boolean(searchFromUrl || searchInput.trim()) || sort !== "updated_desc";
  const coursesQuery = useTeacherCourses(filters);

  function updateListLocation(
    nextStatus: CourseStatusFilter,
    nextPage: number,
    nextSearch = searchFromUrl,
    nextSort = sort,
  ) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextStatus === "all") {
      nextParams.delete("status");
    } else {
      nextParams.set("status", nextStatus);
    }

    const normalizedSearch = nextSearch.trim();
    if (normalizedSearch) {
      nextParams.set("search", normalizedSearch);
    } else {
      nextParams.delete("search");
    }

    if (nextSort === "updated_desc") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", nextSort);
    }

    if (nextPage <= TEACHER_COURSE_DEFAULT_PAGE) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
  }

  function clearFilters() {
    setSearchInput("");
    const nextParams = new URLSearchParams(searchParams);

    for (const key of ["search", "status", "sort", "page"]) {
      nextParams.delete(key);
    }

    setSearchParams(nextParams);
  }

  function renderContent() {
    if (coursesQuery.isPending) {
      return (
        <Notice title="Loading your courses">
          <p className="flex items-center gap-2">
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin text-primary"
            />
            Please wait while your courses load.
          </p>
        </Notice>
      );
    }

    if (coursesQuery.isError) {
      return (
        <Notice title="We couldn't load your courses" tone="error">
          <p>Your course details are not shown. Please try again.</p>
          <button
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={coursesQuery.isFetching}
            onClick={() => void coursesQuery.refetch()}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${coursesQuery.isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </Notice>
      );
    }

    if (!coursesQuery.data || coursesQuery.data.items.length === 0) {
      return (
        <Notice
          title={hasActiveFilters ? "No courses match these filters" : "No courses yet"}
        >
          <p>
            {!hasActiveFilters
              ? "Create a course to start organizing your teaching materials."
              : "Try changing your search or filters, or clear them to see all courses."}
          </p>
        </Notice>
      );
    }

    return (
      <TeacherCourseList
        courses={coursesQuery.data.items}
        isFetching={coursesQuery.isFetching}
        onPageChange={(nextPage) =>
          updateListLocation(status, nextPage, searchFromUrl, sort)
        }
        pagination={coursesQuery.data.pagination}
      />
    );
  }

  const accessStatus = coursesQuery.authorizationStatus;

  if (accessStatus === "loading") {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title="Checking Teacher access">
          <p>Please wait while we check your session.</p>
        </Notice>
      </main>
    );
  }

  if (accessStatus === "unauthenticated") {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title="Sign in to view your courses">
          <Link
            className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
            to="/login"
          >
            Sign in
          </Link>
        </Notice>
      </main>
    );
  }

  if (accessStatus === "forbidden") {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title="Teacher access required" tone="error">
          <p>This page is available to active Teacher accounts.</p>
        </Notice>
      </main>
    );
  }

  if (accessStatus === "error") {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <Notice title="We couldn't check your session" tone="error">
          <p>Your account information is temporarily unavailable.</p>
          <button
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpen aria-hidden="true" className="size-5" />
            Teacher workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your courses
          </h1>
          <p className="max-w-3xl leading-7 text-muted-foreground">
            Create and organize courses for your students. Draft courses can be
            edited before they are submitted for review.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:self-auto"
          to="/teacher/courses/new"
        >
          <Plus aria-hidden="true" className="size-5" />
          Create Course
        </Link>
      </header>

      <section aria-label="Course filters and results" className="space-y-5">
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
              htmlFor="teacher-course-search"
            >
              <Search aria-hidden="true" className="size-4 text-primary" />
              Search course titles
            </label>
            <input
              autoComplete="off"
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              id="teacher-course-search"
              maxLength={COURSE_SEARCH_MAX_LENGTH}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search your courses"
              type="search"
              value={searchInput}
            />
          </div>

          <div className="space-y-2">
            <label
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
              htmlFor="teacher-course-status-filter"
            >
              <ListFilter aria-hidden="true" className="size-4 text-primary" />
              Filter by status
            </label>
            <select
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              id="teacher-course-status-filter"
              onChange={(event) =>
                updateListLocation(
                  event.target.value as CourseStatusFilter,
                  TEACHER_COURSE_DEFAULT_PAGE,
                  searchInput,
                  sort,
                )
              }
              value={status}
            >
              <option value="all">All courses</option>
              {courseStatusSchema.options.map((courseStatus) => (
                <option key={courseStatus} value={courseStatus}>
                  {statusLabels[courseStatus]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-semibold text-foreground"
              htmlFor="teacher-course-sort"
            >
              Sort courses
            </label>
            <select
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              id="teacher-course-sort"
              onChange={(event) =>
                updateListLocation(
                  status,
                  TEACHER_COURSE_DEFAULT_PAGE,
                  searchInput,
                  event.target.value as CourseSort,
                )
              }
              value={sort}
            >
              {teacherCourseSortSchema.options.map((option) => (
                <option key={option} value={option}>
                  {sortLabels[option]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            onClick={clearFilters}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
            Clear filters
          </button>
        ) : null}

        {renderContent()}
      </section>
    </main>
  );
}
