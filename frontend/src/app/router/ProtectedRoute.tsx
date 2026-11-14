import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";

export default function ProtectedRoute() {
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

  return <Outlet />;
}
