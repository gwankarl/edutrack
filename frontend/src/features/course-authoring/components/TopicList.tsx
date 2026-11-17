import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Eye,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import type { TeacherTopicResponse } from "@edutrack/contracts";
import { ApiError } from "../../../lib/api/api-error.js";
import { useReorderCourseTopics } from "../hooks/useContentReordering.js";

export interface TopicListProps {
  courseId: string;
  topics: readonly TeacherTopicResponse[];
  canManage: boolean;
}

export default function TopicList({
  courseId,
  topics,
  canManage,
}: TopicListProps) {
  const encodedCourseId = encodeURIComponent(courseId);
  const reorder = useReorderCourseTopics(courseId);
  const isReordering = reorder.isPending;

  function moveTopic(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (
      !canManage ||
      isReordering ||
      targetIndex < 0 ||
      targetIndex >= topics.length
    ) {
      return;
    }

    const topicIds = topics.map((topic) => topic.id);
    [topicIds[index], topicIds[targetIndex]] = [
      topicIds[targetIndex],
      topicIds[index],
    ];
    reorder.reset();
    reorder.mutate({ topicIds });
  }

  function reorderErrorMessage(): string {
    if (reorder.error instanceof ApiError) {
      if (reorder.error.status === 401)
        return "Your session expired. Sign in again to reorder topics.";
      if (reorder.error.status === 403)
        return "You are no longer authorized to reorder these topics.";
      if (reorder.error.status === 404)
        return "The course or topics could not be found. The list has been refreshed.";
      if (reorder.error.status === 409)
        return "The course is no longer a draft or the topic order changed. The list has been refreshed.";
    }
    return "We couldn't reorder the topics. The list has been refreshed; try again.";
  }

  return (
    <section
      aria-labelledby="course-topics-heading"
      className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-7"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <BookOpen aria-hidden="true" className="size-5" />
            Course content
          </p>
          <h2
            className="text-xl font-semibold text-foreground"
            id="course-topics-heading"
          >
            Topics
          </h2>
        </div>
        {canManage && (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-primary px-4 font-semibold text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:self-auto"
            to={`/teacher/courses/${encodedCourseId}/topics/new`}
          >
            <Plus aria-hidden="true" className="size-5" />
            Add Topic
          </Link>
        )}
      </header>

      {topics.length === 0 ? (
        <p
          className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          {canManage
            ? "This course has no topics yet. Add a topic to begin organizing its content."
            : "This course does not have any topics."}
        </p>
      ) : (
        <div
          aria-label="Course topics"
          className="overflow-x-auto rounded-md border border-border"
          role="region"
          tabIndex={0}
        >
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <caption className="sr-only">Topics in this course</caption>
            <thead className="bg-surface-muted text-sm text-muted-foreground">
              <tr>
                <th className="w-20 px-4 py-3 font-semibold" scope="col">
                  Position
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Topic
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Description
                </th>
                {canManage && (
                  <th className="px-4 py-3 font-semibold" scope="col">
                    <span className="sr-only">Topic ordering and actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topics.map((topic, index) => (
                <tr key={topic.id}>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                    {topic.position}
                  </td>
                  <th
                    className="max-w-64 px-4 py-4 text-left font-semibold text-foreground"
                    scope="row"
                  >
                    <span className="block truncate">{topic.title}</span>
                  </th>
                  <td className="max-w-sm px-4 py-4 text-sm leading-6 text-muted-foreground">
                    {topic.description ?? "No description provided."}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          aria-label={`Move topic ${topic.title} up`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={index === 0 || isReordering}
                          onClick={() => moveTopic(index, -1)}
                          type="button"
                        >
                          <ArrowUp aria-hidden="true" className="size-4" />
                        </button>
                        <button
                          aria-label={`Move topic ${topic.title} down`}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={index === topics.length - 1 || isReordering}
                          onClick={() => moveTopic(index, 1)}
                          type="button"
                        >
                          <ArrowDown aria-hidden="true" className="size-4" />
                        </button>
                        <Link
                          aria-label={`View or edit topic ${topic.title}`}
                          className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          to={`/teacher/courses/${encodedCourseId}/topics/${encodeURIComponent(topic.id)}`}
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
          Saving topic order...
        </p>
      )}
      {canManage && reorder.isSuccess && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          Topic order updated.
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
