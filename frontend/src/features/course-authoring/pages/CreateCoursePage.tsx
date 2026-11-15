import { ArrowLeft, BookOpen } from "lucide-react";
import { Link, useNavigate } from "react-router";

import CourseForm from "../components/CourseForm.js";

export default function CreateCoursePage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-4xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Course navigation">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          to="/teacher/courses"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to courses
        </Link>
      </nav>

      <header className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <BookOpen aria-hidden="true" className="size-5" />
          Teacher workspace
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Create a course
        </h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          Choose an academic level and subject, then give your course a clear
          title. New courses start as drafts so you can prepare their learning
          materials before review.
        </p>
      </header>

      <section
        aria-labelledby="course-form-heading"
        className="space-y-6 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8"
      >
        <div className="space-y-2">
          <h2
            className="text-xl font-semibold text-foreground"
            id="course-form-heading"
          >
            Course details
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Fields marked with an asterisk are required.
          </p>
        </div>
        <CourseForm
          onCreated={(course) =>
            navigate(`/teacher/courses/${encodeURIComponent(course.id)}`, {
              replace: true,
            })
          }
        />
      </section>
    </main>
  );
}
