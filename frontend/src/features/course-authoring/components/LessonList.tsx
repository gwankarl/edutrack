import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Eye,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import type { LessonContent, TeacherLessonResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useReorderTopicLessons } from "../hooks/useContentReordering.js";

const LESSON_PREVIEW_MAX_LENGTH = 180;

function collectLessonText(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectLessonText);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? [record.text] : [];
  const nestedBlocks = Array.isArray(record.blocks)
    ? collectLessonText(record.blocks)
    : [];
  const nestedContent = Array.isArray(record.content)
    ? collectLessonText(record.content)
    : [];

  return [...text, ...nestedBlocks, ...nestedContent];
}

function lessonPreview(content: LessonContent | null): string {
  if (!content) return "Lesson content has not been added yet.";

  const text = collectLessonText(content).join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "Lesson content is available.";
  if (text.length <= LESSON_PREVIEW_MAX_LENGTH) return text;

  return `${text.slice(0, LESSON_PREVIEW_MAX_LENGTH).trimEnd()}...`;
}

export interface LessonListProps {
  courseId: string;
  topicId: string;
  lessons: readonly TeacherLessonResponse[];
  canManage: boolean;
}

export default function LessonList({
  courseId,
  topicId,
  lessons,
  canManage,
}: LessonListProps) {
  const encodedCourseId = encodeURIComponent(courseId);
  const encodedTopicId = encodeURIComponent(topicId);
  const topicPath = `/teacher/courses/${encodedCourseId}/topics/${encodedTopicId}`;
  const reorder = useReorderTopicLessons(courseId, topicId);
  const isReordering = reorder.isPending;

  function moveLesson(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (
      !canManage ||
      isReordering ||
      targetIndex < 0 ||
      targetIndex >= lessons.length
    ) {
      return;
    }

    const lessonIds = lessons.map((lesson) => lesson.id);
    [lessonIds[index], lessonIds[targetIndex]] = [
      lessonIds[targetIndex],
      lessonIds[index],
    ];
    reorder.reset();
    reorder.mutate({ lessonIds });
  }

  function reorderErrorMessage(): string {
    if (reorder.error instanceof ApiError) {
      if (reorder.error.status === 401)
        return "Your session expired. Sign in again to reorder lessons.";
      if (reorder.error.status === 403)
        return "You are no longer authorized to reorder these lessons.";
      if (reorder.error.status === 404)
        return "The course, topic, or lessons could not be found. The list has been refreshed.";
      if (reorder.error.status === 409)
        return "The course is no longer a draft or the lesson order changed. The list has been refreshed.";
    }
    return "We couldn't reorder the lessons. The list has been refreshed; try again.";
  }

  return (
    <section
      aria-labelledby="topic-lessons-heading"
      className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpenText aria-hidden="true" className="size-5" />
            Topic content
          </p>
          <h2
            className="text-xl font-semibold text-foreground"
            id="topic-lessons-heading"
          >
            Lessons
          </h2>
        </div>
        {canManage && (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:self-auto"
            to={`${topicPath}/lessons/new`}
          >
            <Plus aria-hidden="true" className="size-5" />
            Add Lesson
          </Link>
        )}
      </header>

      {lessons.length === 0 ? (
        <p
          className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          {canManage
            ? "This topic has no lessons yet. Add a lesson to start preparing its content."
            : "This topic does not have any lessons."}
        </p>
      ) : (
        <div
          aria-label="Topic lessons"
          className="overflow-x-auto rounded-md border border-border"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <caption className="sr-only">Lessons in this topic</caption>
            <thead className="bg-surface-muted text-sm text-muted-foreground">
              <tr>
                <th className="w-20 px-4 py-3 font-semibold" scope="col">
                  Position
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Lesson
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Content preview
                </th>
                {canManage && (
                  <th className="px-4 py-3 font-semibold" scope="col">
                    <span className="sr-only">Lesson ordering and actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lessons.map((lesson, index) => (
                <tr key={lesson.id}>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                    {lesson.position}
                  </td>
                  <th
                    className="max-w-64 px-4 py-4 text-left font-semibold text-foreground"
                    scope="row"
                  >
                    <span className="block truncate">{lesson.title}</span>
                  </th>
                  <td className="max-w-sm px-4 py-4 text-sm leading-6 text-muted-foreground">
                    {lessonPreview(lesson.content)}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Move lesson ${lesson.title} up`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={index === 0 || isReordering}
                          onClick={() => moveLesson(index, -1)}
                          type="button"
                        >
                          <ArrowUp aria-hidden="true" className="size-4" />
                        </button>
                        <button
                          aria-label={`Move lesson ${lesson.title} down`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={index === lessons.length - 1 || isReordering}
                          onClick={() => moveLesson(index, 1)}
                          type="button"
                        >
                          <ArrowDown aria-hidden="true" className="size-4" />
                        </button>
                        <Link
                          aria-label={`View or edit lesson ${lesson.title}`}
                          className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          to={`${topicPath}/lessons/${encodeURIComponent(lesson.id)}`}
                        >
                          <Eye aria-hidden="true" className="size-4" />
                          View / edit
                        </Link>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage && reorder.isPending && (
        <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Saving lesson order...
        </p>
      )}
      {canManage && reorder.isSuccess && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          Lesson order updated.
        </p>
      )}
      {canManage && reorder.isError && (
        <p aria-live="polite" className="flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {reorderErrorMessage()}
        </p>
      )}
    </section>
  );
}
