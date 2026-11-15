import type { ReactNode } from "react";

import {
  ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE,
  ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE_SIZE,
} from "@edutrack/contracts";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { currentUserQueryKey } from "../../../auth/hooks/auth-query-keys.js";
import {
  useTeacherApplications,
  type AdministratorAccessStatus,
} from "../hooks/useTeacherApplications.js";
import type { AdminTeacherApplicationListFilters } from "../api/teacher-application-review.api.js";
import TeacherApplicationFilters, {
  type TeacherApplicationStatusFilter,
} from "../components/TeacherApplicationFilters.js";
import TeacherApplicationsTable from "../components/TeacherApplicationsTable.js";

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
      className={`space-y-2 rounded-lg border bg-surface p-5 ${
        tone === "error" ? "border-danger" : "border-border"
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function AccessMessage({
  status,
  onRetry,
}: {
  status: AdministratorAccessStatus;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <Notice title="Checking administrator access">
        <p>Please wait while we check your session.</p>
      </Notice>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Notice title="Sign in to review applications">
        <Link
          className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in
        </Link>
      </Notice>
    );
  }

  if (status === "forbidden") {
    return (
      <Notice title="Administrator access required" tone="error">
        <p>This page is available to Administrator accounts.</p>
      </Notice>
    );
  }

  if (status === "error") {
    return (
      <Notice title="We couldn't check your session" tone="error">
        <p>Please try again. Your account details are not shown.</p>
        <button
          className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Try again
        </button>
      </Notice>
    );
  }

  return null;
}

export default function TeacherApplicationsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedStatus = searchParams.get("status");
  const status: TeacherApplicationStatusFilter =
    requestedStatus !== null &&
    (requestedStatus === "pending" ||
      requestedStatus === "approved" ||
      requestedStatus === "rejected")
      ? requestedStatus
      : "all";

  const requestedPage = Number(searchParams.get("page"));
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1
      ? requestedPage
      : ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE;

  const filters: AdminTeacherApplicationListFilters = {
    page,
    pageSize: ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE_SIZE,
    ...(status === "all" ? {} : { status }),
  };

  const applicationsQuery = useTeacherApplications(filters);
  const accessStatus = applicationsQuery.authorizationStatus;
  const pagination = applicationsQuery.data?.pagination;

  function updateListLocation(
    nextStatus: TeacherApplicationStatusFilter,
    nextPage: number,
  ) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextStatus === "all") {
      nextParams.delete("status");
    } else {
      nextParams.set("status", nextStatus);
    }

    if (nextPage <= ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
  }

  function changeStatus(nextStatus: TeacherApplicationStatusFilter) {
    updateListLocation(nextStatus, ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE);
  }

  function renderApplications() {
    if (applicationsQuery.isPending) {
      return (
        <Notice title="Loading applications">
          <p className="flex items-center gap-2">
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin text-primary"
            />
            Please wait while applications load.
          </p>
        </Notice>
      );
    }

    if (applicationsQuery.isError) {
      return (
        <Notice title="We couldn't load applications" tone="error">
          <p>Try again. Application details are not shown.</p>
          <button
            className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            disabled={applicationsQuery.isFetching}
            onClick={() => void applicationsQuery.refetch()}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${applicationsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Try again
          </button>
        </Notice>
      );
    }

    if (!applicationsQuery.data) {
      return null;
    }

    const { items } = applicationsQuery.data;

    if (items.length === 0) {
      return (
        <Notice title="No applications found">
          <p>
            {status === "all"
              ? "There are no teacher applications to review."
              : `There are no ${status} applications on this page.`}
          </p>
        </Notice>
      );
    }

    return (
      <div className="space-y-4">
        <TeacherApplicationsTable applications={items} />

        {pagination && (
          <nav
            aria-label="Teacher application pages"
            className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ·{" "}
              {pagination.totalItems} applications
            </p>
            <div className="flex gap-2">
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                disabled={pagination.page <= 1 || applicationsQuery.isFetching}
                onClick={() =>
                  updateListLocation(
                    status,
                    Math.max(
                      ADMIN_TEACHER_APPLICATION_DEFAULT_PAGE,
                      pagination.page - 1,
                    ),
                  )
                }
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
                Previous
              </button>
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                disabled={
                  pagination.page >= pagination.totalPages ||
                  applicationsQuery.isFetching
                }
                onClick={() => updateListLocation(status, pagination.page + 1)}
                type="button"
              >
                Next
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          </nav>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-primary">
          Administrator review
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Teacher applications
        </h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          Review teacher applications and open an application to see its
          details.
        </p>
      </header>

      {accessStatus === "authorized" ? (
        <div className="space-y-5">
          <TeacherApplicationFilters
            onStatusChange={changeStatus}
            status={status}
          />
          {renderApplications()}
        </div>
      ) : (
        <AccessMessage
          onRetry={() => {
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            });
          }}
          status={accessStatus}
        />
      )}
    </main>
  );
}
