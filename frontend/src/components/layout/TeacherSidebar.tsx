import { useId } from "react";
import {
  BookOpen,
  LayoutDashboard,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import { NavLink } from "react-router";

import WorkspaceSwitcher from "./WorkspaceSwitcher.js";

interface TeacherSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

const teacherLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive
      ? "bg-primary text-inverse"
      : "text-foreground hover:bg-surface-muted",
  ].join(" ");

const defaultSidebarClassName =
  "w-full shrink-0 rounded-lg border border-border bg-surface p-4 lg:sticky lg:top-6 lg:w-56 lg:self-start";

export default function TeacherSidebar({
  className = defaultSidebarClassName,
  onNavigate,
}: TeacherSidebarProps) {
  const sidebarHeadingId = useId();

  return (
    <aside aria-labelledby={sidebarHeadingId} className={className}>
      <div className="space-y-4 border-b border-border pb-4">
        <h2
          className="text-sm font-semibold text-foreground"
          id={sidebarHeadingId}
        >
          Teacher workspace
        </h2>
        <WorkspaceSwitcher onWorkspaceChange={onNavigate} />
      </div>

      <nav aria-label="Teacher workspace navigation" className="mt-4 space-y-1">
        <NavLink
          aria-label="Overview"
          className={teacherLinkClassName}
          onClick={onNavigate}
          end
          to="/teacher"
        >
          <LayoutDashboard aria-hidden="true" className="size-5 shrink-0" />
          <span>Overview</span>
        </NavLink>

        <NavLink
          onClick={onNavigate}
          className={teacherLinkClassName}
          to="/teacher/courses"
        >
          <BookOpen aria-hidden="true" className="size-5 shrink-0" />
          <span>My Courses</span>
        </NavLink>

        <button
          aria-label="Reviews, Coming Soon"
          className="inline-flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-muted-foreground opacity-70"
          disabled
          type="button"
        >
          <MessageSquareText aria-hidden="true" className="size-5 shrink-0" />
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span>Reviews</span>
            <span className="rounded-full bg-background px-2 py-1 text-xs">
              Coming Soon
            </span>
          </span>
        </button>

        <NavLink
          onClick={onNavigate}
          className={teacherLinkClassName}
          end
          to="/profile"
        >
          <UserRound aria-hidden="true" className="size-5 shrink-0" />
          <span>My Profile</span>
        </NavLink>
      </nav>
    </aside>
  );
}
