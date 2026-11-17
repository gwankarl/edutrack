import {
  BadgeCheck,
  BookOpen,
  Clock3,
  FileText,
  RefreshCw,
} from "lucide-react";
import type { TeacherDashboardSummaryResponse } from "@edutrack/contracts";

import CourseSummaryCard from "./CourseSummaryCard.js";

export interface CourseSummaryCardsProps {
  summary?: TeacherDashboardSummaryResponse;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

function SummarySkeletons() {
  return (
    <section aria-labelledby="course-summary-heading" className="space-y-4">
      <h2
        className="text-xl font-semibold text-foreground"
        id="course-summary-heading"
      >
        Course summary
      </h2>
      <p aria-live="polite" className="sr-only" role="status">
        Loading course summary.
      </p>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="min-h-32 animate-pulse rounded-lg border border-border bg-surface p-5"
            key={index}
          >
            <div className="mb-4 h-4 w-28 rounded bg-surface-muted" />
            <div className="h-8 w-16 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CourseSummaryCards({
  summary,
  isLoading,
  isError,
  isFetching,
  onRetry,
}: CourseSummaryCardsProps) {
  if (isLoading) {
    return <SummarySkeletons />;
  }

  if (isError || !summary) {
    return (
      <section aria-labelledby="course-summary-heading" className="space-y-4">
        <h2
          className="text-xl font-semibold text-foreground"
          id="course-summary-heading"
        >
          Course summary
        </h2>
        <div
          aria-live="polite"
          className="space-y-3 rounded-lg border border-danger bg-danger-surface p-5"
          role="alert"
        >
          <p className="font-semibold text-danger">
            We couldn&apos;t load your course summary.
          </p>
          <p className="text-sm leading-6 text-danger">
            Course counts are not available right now. Please try again.
          </p>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-danger px-4 font-semibold text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isFetching}
            onClick={onRetry}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </div>
      </section>
    );
  }

  const cards = [
    {
      label: "Total Courses",
      value: summary.statusCounts.total,
      icon: BookOpen,
    },
    {
      label: "Draft Courses",
      value: summary.statusCounts.draft,
      icon: FileText,
    },
    {
      label: "In Review",
      value: summary.statusCounts.pendingReview,
      icon: Clock3,
    },
    {
      label: "Published",
      value: summary.statusCounts.published,
      icon: BadgeCheck,
    },
  ] as const;

  return (
    <section aria-labelledby="course-summary-heading" className="space-y-4">
      <h2
        className="text-xl font-semibold text-foreground"
        id="course-summary-heading"
      >
        Course summary
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <CourseSummaryCard
            icon={card.icon}
            key={card.label}
            label={card.label}
            value={card.value}
          />
        ))}
      </div>
    </section>
  );
}
