import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonContent, TeacherLessonResponse } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { useReorderTopicLessons } from "../hooks/useContentReordering.js";
import LessonList from "./LessonList.js";

vi.mock("../hooks/useContentReordering.js", () => ({
  useReorderTopicLessons: vi.fn(),
}));

const courseId = "550e8400-e29b-41d4-a716-446655440020";
const topicId = "550e8400-e29b-41d4-a716-446655440021";
const lessons = [
  {
    id: "550e8400-e29b-41d4-a716-446655440022",
    topicId,
    title: "Solving a linear equation",
    content: { blocks: [{ type: "paragraph", text: "Isolate the unknown." }] },
    position: 1,
    createdAt: "2026-11-15T12:00:00.000Z",
    updatedAt: "2026-11-15T12:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440023",
    topicId,
    title: "Practice",
    content: null,
    position: 2,
    createdAt: "2026-11-16T12:00:00.000Z",
    updatedAt: "2026-11-16T12:00:00.000Z",
  },
] satisfies TeacherLessonResponse[];

const reorderMutation = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as unknown,
};

function renderList(
  canManage: boolean,
  lessonItems: readonly TeacherLessonResponse[] = lessons,
) {
  return render(
    <MemoryRouter>
      <LessonList
        canManage={canManage}
        courseId={courseId}
        lessons={lessonItems}
        topicId={topicId}
      />
    </MemoryRouter>,
  );
}

describe("LessonList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reorderMutation.isPending = false;
    reorderMutation.isSuccess = false;
    reorderMutation.isError = false;
    reorderMutation.error = null;
    vi.mocked(useReorderTopicLessons).mockReturnValue(
      reorderMutation as unknown as ReturnType<typeof useReorderTopicLessons>,
    );
  });

  it("shows lessons in backend order with a text preview and management links", () => {
    renderList(true);

    expect(
      screen.getByRole("table", { name: "Lessons in this topic" }),
    ).toBeVisible();
    expect(screen.getByText("Solving a linear equation")).toBeVisible();
    expect(screen.getByText("Isolate the unknown.")).toBeVisible();
    expect(screen.getByText("Lesson content has not been added yet.")).toBeVisible();
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Add Lesson" })).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/new`,
    );
    expect(
      screen.getByRole("link", {
        name: "View or edit lesson Solving a linear equation",
      }),
    ).toHaveAttribute(
      "href",
      `/teacher/courses/${courseId}/topics/${topicId}/lessons/${lessons[0].id}`,
    );
    expect(screen.getByRole("button", { name: "Move lesson Solving a linear equation up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move lesson Practice down" })).toBeDisabled();
  });

  it("shows lessons without management actions when read-only", () => {
    renderList(false);

    expect(screen.getByText("Solving a linear equation")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add Lesson" })).toBeNull();
    expect(screen.queryByRole("link", { name: /view or edit lesson/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /move lesson/i })).toBeNull();
  });

  it("shows a text preview from newly authored Tiptap JSON", () => {
    renderList(false, [
      {
        ...lessons[0],
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "New structured lesson preview." },
                { type: "inlineMath", attrs: { latex: "x+1=2" } },
              ],
            },
          ],
        } as LessonContent,
      },
    ]);

    expect(screen.getByText("New structured lesson preview.")).toBeVisible();
  });

  it("shows an empty state for editable and read-only topics", () => {
    const { rerender } = render(
      <MemoryRouter>
        <LessonList
          canManage
          courseId={courseId}
          lessons={[]}
          topicId={topicId}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "This topic has no lessons yet.",
    );
    expect(screen.getByRole("link", { name: "Add Lesson" })).toBeVisible();

    rerender(
      <MemoryRouter>
        <LessonList
          canManage={false}
          courseId={courseId}
          lessons={[]}
          topicId={topicId}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "This topic does not have any lessons.",
    );
    expect(screen.queryByRole("link", { name: "Add Lesson" })).toBeNull();
  });

  it("submits the complete swapped lesson order and renders refreshed backend order", async () => {
    const user = userEvent.setup();
    const rendered = renderList(true);

    await user.click(
      screen.getByRole("button", {
        name: "Move lesson Solving a linear equation down",
      }),
    );

    expect(reorderMutation.mutate).toHaveBeenCalledWith({
      lessonIds: [lessons[1].id, lessons[0].id],
    });

    rendered.rerender(
      <MemoryRouter>
        <LessonList
          canManage
          courseId={courseId}
          lessons={[
            { ...lessons[1], position: 1 },
            { ...lessons[0], position: 2 },
          ]}
          topicId={topicId}
        />
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Practice");
    expect(rows[2]).toHaveTextContent("Solving a linear equation");
  });

  it("disables controls while pending and reports safe success or conflict feedback", () => {
    reorderMutation.isPending = true;
    const { rerender } = renderList(true);
    expect(screen.getByRole("status")).toHaveTextContent("Saving lesson order");
    expect(screen.getByRole("button", { name: "Move lesson Solving a linear equation down" })).toBeDisabled();

    reorderMutation.isPending = false;
    reorderMutation.isSuccess = true;
    rerender(
      <MemoryRouter>
        <LessonList canManage courseId={courseId} lessons={lessons} topicId={topicId} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Lesson order updated.");

    reorderMutation.isSuccess = false;
    reorderMutation.isError = true;
    reorderMutation.error = new ApiError({ status: 409, title: "Conflict" });
    rerender(
      <MemoryRouter>
        <LessonList canManage courseId={courseId} lessons={lessons} topicId={topicId} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The course is no longer a draft");
  });
});
