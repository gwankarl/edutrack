import { useQueryClient } from "@tanstack/react-query";
import type { CurrentUserRole } from "@edutrack/contracts";
import { Navigate, Outlet, useLocation } from "react-router";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";

type RoleGuardProps = {
  allowedRoles: readonly CurrentUserRole[];
};

export default function RoleGuard({ allowedRoles }: RoleGuardProps) {
  const currentUser = useCurrentUser();
  const location = useLocation();
  const queryClient = useQueryClient();

  if (currentUser.status === "loading") {
    return (
      <p aria-live="polite" className="text-muted-foreground" role="status">
        Checking your session...
      </p>
    );
  }

  if (currentUser.status === "error") {
    return (
      <section aria-labelledby="session-error-heading" className="space-y-3">
        <h1
          className="text-xl font-semibold text-foreground"
          id="session-error-heading"
        >
          Session unavailable
        </h1>
        <p className="text-muted-foreground" role="alert">
          We couldn’t check your session. Please try again.
        </p>
        <button
          className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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

  if (currentUser.status === "unauthenticated") {
    const from = `${location.pathname}${location.search}${location.hash}`;

    return <Navigate replace to="/login" state={{ from }} />;
  }

  const hasAllowedRole = currentUser.user.roles.some((role) =>
    allowedRoles.includes(role),
  );

  if (!hasAllowedRole) {
    return (
      <section
        aria-labelledby="access-denied-heading"
        className="rounded-md border border-border bg-surface p-6"
      >
        <h1
          className="text-xl font-semibold text-foreground"
          id="access-denied-heading"
        >
          Access denied
        </h1>
        <p className="mt-2 text-muted-foreground" role="alert">
          Your account does not have permission to view this page.
        </p>
      </section>
    );
  }

  return <Outlet />;
}
