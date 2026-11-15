import { BookOpen, GraduationCap, LayoutDashboard } from "lucide-react";
import { NavLink, Outlet } from "react-router";

const workspaceLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    isActive
      ? "bg-primary text-inverse"
      : "text-foreground hover:bg-surface-muted",
  ].join(" ");

export default function TeacherLayout() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">
            Teacher workspace
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            Teaching workspace
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage your courses and prepare learning materials for your
            students.
          </p>
        </div>

        <div className="inline-flex min-h-11 items-center gap-2 self-start rounded-md bg-primary/10 px-3 text-sm font-semibold text-primary sm:self-auto">
          <GraduationCap aria-hidden="true" className="size-5" />
          Teacher
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Teacher workspace navigation"
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
        >
          <NavLink className={workspaceLinkClassName} end to=".">
            <LayoutDashboard aria-hidden="true" className="size-5" />
            Overview
          </NavLink>

          <NavLink className={workspaceLinkClassName} to="courses">
            <BookOpen aria-hidden="true" className="size-5" />
            My Courses
          </NavLink>
        </nav>

        <section aria-label="Teacher workspace page" className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
