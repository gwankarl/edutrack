import { useState } from "react";

import { BookOpen, Image } from "lucide-react";
import { Link } from "react-router";
import type { TeacherCourseResponse } from "@edutrack/contracts";

import CourseDetails from "./CourseDetails.js";
import CourseForm from "./CourseForm.js";

interface CourseOverviewProps {
  course: TeacherCourseResponse;
  onUpdated?: () => void;
}

export default function CourseOverview({
  course,
  onUpdated,
}: CourseOverviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSavedMessage, setShowSavedMessage] = useState(false);

  function handleUpdated() {
    setIsEditing(false);
    setShowSavedMessage(true);
    onUpdated?.();
  }

  function toggleEditing() {
    setShowSavedMessage(false);
    setIsEditing((currentlyEditing) => !currentlyEditing);
  }

  return (
    <div className="space-y-6">
      <section aria-label="Course thumbnail">
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-surface-muted">
          {course.thumbnail?.url ? (
            <img
              alt={`${course.title} course thumbnail`}
              className="size-full object-cover"
              loading="lazy"
              src={course.thumbnail.url}
            />
          ) : (
            <div
              aria-label={`${course.title} has no course thumbnail`}
              className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground"
              role="img"
            >
              <Image aria-hidden="true" className="size-8" />
              <span>No course thumbnail uploaded</span>
            </div>
          )}
        </div>
      </section>

      <CourseDetails course={course} showIdentity={false} />

      {showSavedMessage && (
        <p
          aria-live="polite"
          className="text-sm font-medium text-success"
          role="status"
        >
          Course details saved.
        </p>
      )}

      {course.status === "draft" ? (
        <section
          aria-labelledby="course-edit-heading"
          className="space-y-4 rounded-lg border border-border bg-surface p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2
                className="text-xl font-semibold text-foreground"
                id="course-edit-heading"
              >
                Course details
              </h2>
              <p className="text-sm text-muted-foreground">
                Draft details and the course thumbnail can be edited here.
              </p>
            </div>
            <button
              aria-controls="course-details-editor"
              aria-expanded={isEditing}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 font-semibold text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={toggleEditing}
              type="button"
            >
              {isEditing ? "Cancel editing" : "Edit Course Details"}
            </button>
          </div>

          {isEditing && (
            <div
              className="border-t border-border pt-5"
              id="course-details-editor"
            >
              <CourseForm initialCourse={course} onUpdated={handleUpdated} />
            </div>
          )}
        </section>
      ) : (
        <section
          aria-labelledby="course-read-only-heading"
          className="space-y-2 rounded-lg border border-border bg-surface p-5"
        >
          <h2
            className="font-semibold text-foreground"
            id="course-read-only-heading"
          >
            This course is read-only
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Only Draft courses can be edited. This course is currently{" "}
            {course.status.replace("_", " ")}.
          </p>
        </section>
      )}

      <Link
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        to={`/teacher/courses/${encodeURIComponent(course.id)}/topics`}
      >
        <BookOpen aria-hidden="true" className="size-5" />
        {course.status === "draft" ? "Manage topics" : "View topics"}
      </Link>
    </div>
  );
}
