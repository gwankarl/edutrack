import type { ChangeEvent } from "react";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BriefcaseBusiness,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";
import {
  getAvailableWorkspaces,
  isWorkspaceAvailable,
  resolveWorkspaceSelection,
  workspaceConfig,
  type Workspace,
} from "../../lib/workspace/workspace-config.js";

const teacherApplicationRoutes = [
  "/teacher/apply",
  "/teacher/application-status",
];

function workspaceForPath(
  pathname: string,
  workspaces: readonly Workspace[],
): Workspace | undefined {
  return workspaces.find((workspace) => {
    if (
      workspace.id === "teacher" &&
      teacherApplicationRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`),
      )
    ) {
      return false;
    }

    const { landingRoute } = workspace;

    return pathname === landingRoute || pathname.startsWith(`${landingRoute}/`);
  });
}

export default function WorkspaceSwitcher() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  if (currentUser.status === "loading") {
    return (
      <p
        aria-busy="true"
        className="inline-flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin text-primary"
        />
        Loading workspaces...
      </p>
    );
  }

  if (currentUser.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p
          className="inline-flex items-center gap-2 text-sm text-danger"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="size-4" />
          We couldn&apos;t check your session.
        </p>
        <button
          className="min-h-11 rounded-md px-3 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            })
          }
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (currentUser.status === "unauthenticated") {
    return (
      <p className="min-h-11 px-3 text-sm text-muted-foreground" role="status">
        <Link
          className="font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/login"
        >
          Sign in to access a workspace
        </Link>
      </p>
    );
  }

  const user = currentUser.user;
  const availableWorkspaces = getAvailableWorkspaces(user);

  if (availableWorkspaces.length === 0) {
    return (
      <p className="min-h-11 px-3 text-sm text-muted-foreground" role="status">
        No workspace is available for this account.
      </p>
    );
  }

  const activeWorkspace = workspaceForPath(
    location.pathname,
    availableWorkspaces,
  );
  const selectedWorkspace = resolveWorkspaceSelection(
    user,
    activeWorkspace?.id,
  );

  if (!selectedWorkspace) {
    return null;
  }

  if (availableWorkspaces.length === 1) {
    return (
      <p
        aria-label={`Current workspace: ${selectedWorkspace.label}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground"
        role="status"
      >
        <BriefcaseBusiness aria-hidden="true" className="size-5 text-primary" />
        <span>Current workspace:</span>
        <span>{selectedWorkspace.label}</span>
      </p>
    );
  }

  function handleWorkspaceChange(event: ChangeEvent<HTMLSelectElement>) {
    const workspaceId = event.currentTarget.value;

    // Treat the select value as untrusted even though unavailable roles are
    // omitted from its options.
    if (!isWorkspaceAvailable(workspaceId, user)) {
      return;
    }

    navigate(workspaceConfig[workspaceId].landingRoute);
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2">
      <label
        className="text-sm font-medium text-foreground"
        htmlFor="workspace-switcher"
      >
        Workspace
      </label>
      <div className="relative">
        <ArrowLeftRight
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary"
        />
        <select
          aria-label="Workspace"
          className="min-h-11 min-w-48 rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          id="workspace-switcher"
          onChange={handleWorkspaceChange}
          value={selectedWorkspace.id}
        >
          {availableWorkspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.label}
            </option>
          ))}
        </select>
      </div>
      <span className="sr-only" role="status">
        Current workspace: {selectedWorkspace.label}
      </span>
    </div>
  );
}
