import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import { Link, NavLink } from "react-router";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";
import { useLogout } from "../../features/auth/hooks/useLogout.js";

const accountLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive ? "text-primary" : "text-foreground hover:text-primary",
  ].join(" ");

export default function UserMenu() {
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  if (currentUser.status === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label="Account navigation"
        className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin text-primary"
        />
        Checking session...
      </div>
    );
  }

  if (currentUser.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground" role="status">
          Session status unavailable
        </span>
        <button
          className="min-h-11 rounded-md px-3 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: currentUserQueryKey,
            })
          }
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (currentUser.status === "unauthenticated") {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Link className={accountLinkClassName({ isActive: false })} to="/login">
          Login
        </Link>
      </div>
    );
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      setIsOpen(false);
    } catch {
      // The mutation error below provides safe feedback.
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="relative" onKeyDown={handleMenuKeyDown}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-label={`${currentUser.user.displayName} account menu`}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={() => setIsOpen((open) => !open)}
        ref={triggerRef}
        type="button"
      >
        <UserRound
          aria-hidden="true"
          className="size-5 shrink-0 text-primary"
        />
        <span className="max-w-40 truncate">
          {currentUser.user.displayName}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-60 rounded-md border border-border bg-surface p-2 shadow-lg"
          id={menuId}
        >
          <section aria-labelledby={`${menuId}-roles`} className="px-3 py-2">
            <h2
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              id={`${menuId}-roles`}
            >
              Assigned roles
            </h2>
            {currentUser.user.roles.length > 0 ? (
              <ul
                aria-label="Assigned roles"
                className="mt-2 flex flex-wrap gap-2"
              >
                {currentUser.user.roles.map((role) => (
                  <li
                    className="rounded-full bg-background px-2 py-1 text-xs capitalize text-foreground"
                    key={role}
                  >
                    {role}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No roles assigned
              </p>
            )}
          </section>

          <nav aria-label="Account menu" className="space-y-1">
            <NavLink
              className={accountLinkClassName}
              end
              onClick={() => setIsOpen(false)}
              to="/profile"
            >
              Profile
            </NavLink>

            <button
              className="inline-flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
              disabled={logout.isPending}
              onClick={() => void handleLogout()}
              type="button"
            >
              {logout.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <LogOut aria-hidden="true" className="size-4" />
              )}
              {logout.isPending ? "Logging out..." : "Logout"}
            </button>
          </nav>

          {logout.isError && (
            <p className="mt-2 flex gap-2 p-2 text-sm text-danger" role="alert">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              We couldn’t log you out. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
