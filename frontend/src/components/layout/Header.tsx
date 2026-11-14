import { Link, NavLink } from "react-router";
import { ClipboardCheck, GraduationCap } from "lucide-react";

import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";
import { useMyTeacherApplication } from "../../features/teacher-applications/hooks/useMyTeacherApplication.js";
import UserMenu from "./UserMenu.js";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive ? "text-primary" : "text-foreground hover:text-primary",
  ].join(" ");

export default function Header() {
  const currentUser = useCurrentUser();
  const applicationQuery = useMyTeacherApplication();

  const isTeacher =
    currentUser.status === "authenticated" &&
    currentUser.user.roles.includes("teacher");

  const application =
    currentUser.status === "authenticated" &&
    !isTeacher &&
    applicationQuery.isSuccess
      ? applicationQuery.data.application
      : undefined;

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <Link
          aria-label="EduTrack home"
          className="w-fit rounded-sm text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          to="/"
        >
          EduTrack
        </Link>

        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <nav
            aria-label="Primary navigation"
            className="flex flex-wrap items-center gap-1"
          >
            <NavLink className={navLinkClassName} end to="/">
              Home
            </NavLink>
            <NavLink className={navLinkClassName} end to="/register">
              Register
            </NavLink>

            {currentUser.status === "authenticated" &&
              !isTeacher &&
              applicationQuery.isSuccess && (
                <>
                  {(!application || application.status === "rejected") && (
                    <NavLink className={navLinkClassName} to="/teacher/apply">
                      <GraduationCap
                        aria-hidden="true"
                        className="mr-2 size-5"
                      />
                      Become a Teacher
                    </NavLink>
                  )}

                  {application && (
                    <NavLink
                      className={navLinkClassName}
                      to="/teacher/application-status"
                    >
                      <ClipboardCheck
                        aria-hidden="true"
                        className="mr-2 size-5"
                      />
                      Application Status
                    </NavLink>
                  )}
                </>
              )}
          </nav>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
