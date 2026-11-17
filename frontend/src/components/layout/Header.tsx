import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Menu,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

import { useCurrentUser } from "../../features/auth/hooks/useCurrentUser.js";
import { useMyTeacherApplication } from "../../features/teacher-applications/hooks/useMyTeacherApplication.js";
import UserMenu from "./UserMenu.js";
import WorkspaceSwitcher from "./WorkspaceSwitcher.js";
import TeacherNavigationDrawer from "./TeacherNavigationDrawer.js";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive ? "text-primary" : "text-foreground hover:text-primary",
  ].join(" ");

export default function Header() {
  const location = useLocation();
  const isTeacherWorkspaceRoute =
    location.pathname === "/teacher" ||
    location.pathname === "/teacher/courses" ||
    location.pathname.startsWith("/teacher/courses/");

  const [isTeacherDrawerOpen, setIsTeacherDrawerOpen] = useState(false);
  const teacherMenuButtonRef = useRef<HTMLButtonElement>(null);
  const closeTeacherDrawer = useCallback(
    () => setIsTeacherDrawerOpen(false),
    [],
  );

  useEffect(() => {
    setIsTeacherDrawerOpen(false);
  }, [location.pathname]);

  const currentUser = useCurrentUser();
  const applicationQuery = useMyTeacherApplication();

  const isTeacher =
    currentUser.status === "authenticated" &&
    currentUser.user.roles.includes("teacher");

  const isAdministrator =
    currentUser.status === "authenticated" &&
    currentUser.user.roles.includes("administrator");

  const application =
    currentUser.status === "authenticated" &&
    !isTeacher &&
    applicationQuery.isSuccess
      ? applicationQuery.data.application
      : undefined;

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            {isTeacherWorkspaceRoute && (
              <button
                aria-controls="teacher-navigation-dialog"
                aria-expanded={isTeacherDrawerOpen}
                aria-label="Open Teacher navigation"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden"
                onClick={() => setIsTeacherDrawerOpen(true)}
                ref={teacherMenuButtonRef}
                type="button"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            )}

            <Link
              aria-label="EduTrack home"
              className="w-fit rounded-sm text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
              to="/"
            >
              EduTrack
            </Link>
          </div>

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

              {isAdministrator && (
                <NavLink
                  className={navLinkClassName}
                  to="/admin/teacher-applications"
                >
                  <ClipboardList aria-hidden="true" className="mr-2 size-5" />
                  Teacher Applications
                </NavLink>
              )}

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
            {currentUser.status === "authenticated" &&
              !isTeacherWorkspaceRoute && <WorkspaceSwitcher />}
            <UserMenu />
          </div>
        </div>
      </header>

      {isTeacherWorkspaceRoute && (
        <TeacherNavigationDrawer
          onClose={closeTeacherDrawer}
          open={isTeacherDrawerOpen}
          triggerRef={teacherMenuButtonRef}
        />
      )}
    </>
  );
}
