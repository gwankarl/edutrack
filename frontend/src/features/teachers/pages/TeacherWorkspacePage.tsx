import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CircleAlert,
  GraduationCap,
  LoaderCircle,
} from "lucide-react";
import { Link } from "react-router";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";

export default function TeacherWorkspacePage() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();

  if (currentUser.status === "loading") {
    return (
      <section
        aria-labelledby="teacher-workspace-loading-heading"
        className="rounded-lg border border-border bg-surface p-5 sm:p-6"
      >
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-muted-foreground"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-primary"
          />
          Loading your Teacher workspace...
        </p>
      </section>
    );
  }

  if (currentUser.status === "unauthenticated") {
    return (
      <section
        aria-labelledby="teacher-workspace-sign-in-heading"
        className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-6"
        role="status"
      >
        <h2
          className="text-lg font-semibold text-foreground"
          id="teacher-workspace-sign-in-heading"
        >
          Sign in to view this workspace
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Your Teacher workspace is available after you sign in.
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in
        </Link>
      </section>
    );
  }

  if (currentUser.status === "error") {
    return (
      <section
        aria-labelledby="teacher-workspace-error-heading"
        className="space-y-3 rounded-lg border border-danger bg-danger-surface p-5 sm:p-6"
        role="alert"
      >
        <h2
          className="flex items-center gap-2 text-lg font-semibold text-danger"
          id="teacher-workspace-error-heading"
        >
          <CircleAlert aria-hidden="true" className="size-5" />
          We couldn&apos;t load your workspace
        </h2>
        <p className="text-sm leading-6 text-danger">
          Your account information is temporarily unavailable. Please try again.
        </p>
        <button
          className="inline-flex min-h-11 items-center rounded-md border border-danger px-4 font-medium text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            })
          }
          type="button"
        >
          Try again
        </button>
      </section>
    );
  }

  const displayName = currentUser.user.displayName.trim() || "Teacher";

  return (
    <section
      aria-labelledby="teacher-workspace-page-heading"
      className="space-y-6"
    >
      <header className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-7">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          <GraduationCap aria-hidden="true" className="size-5" />
          Teacher workspace
        </div>

        <h2
          className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          id="teacher-workspace-page-heading"
        >
          Welcome, {displayName}!
        </h2>

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          This is your space to prepare and organize teacher-curated, self-paced
          learning materials for your students.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <section
          aria-labelledby="teacher-workspace-purpose-heading"
          className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-6"
        >
          <h3
            className="text-lg font-semibold text-foreground"
            id="teacher-workspace-purpose-heading"
          >
            Your teaching workspace
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            EduTrack helps teachers prepare clear learning experiences that
            students can follow at their own pace.
          </p>
        </section>

        <section
          aria-labelledby="teacher-workspace-upcoming-heading"
          className="space-y-3 rounded-lg border border-border bg-surface p-5 sm:p-6"
        >
          <h3
            className="flex items-center gap-2 text-lg font-semibold text-foreground"
            id="teacher-workspace-upcoming-heading"
          >
            <BookOpen aria-hidden="true" className="size-5 text-primary" />
            Course tools coming later
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Course creation and management capabilities are planned for a future
            update. They are not available in this workspace yet.
          </p>
        </section>
      </div>
    </section>
  );
}
