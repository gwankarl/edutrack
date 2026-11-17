import { GraduationCap } from "lucide-react";
import { Outlet } from "react-router";

import TeacherSidebar from "../../components/layout/TeacherSidebar.js";

export default function TeacherLayout() {
  return (
    <div className="min-w-0 space-y-6">
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

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <TeacherSidebar />
        </div>

        <section
          aria-label="Teacher workspace page"
          className="min-w-0 max-w-full"
        >
          <Outlet />
        </section>
      </div>
    </div>
  );
}
